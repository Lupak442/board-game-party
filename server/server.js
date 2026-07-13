import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '../client/dist')));


const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

// Game State
let users = []; // { id, name, isHost, score }
let gameState = 'lobby'; 
// lobby -> manitto -> liar_topic -> liar_role -> liar_discuss -> liar_vote -> liar_exec_vote -> liar_guess -> liar_result
let manittoPairs = {}; // { [id]: targetName }

// Liar Game State
let liarGame = {
  topic: '',
  secretWord: '',
  liarName: '',
  votes: {}, // { [voterName]: targetName }
  execVotes: {}, // { [voterName]: boolean } // true = execute
  targetName: '', // name of the person being voted for execution
  winner: '', // 'citizen' or 'liar'
  discussCount: 0
};

// Helpers
const broadcastState = () => {
  io.emit('stateUpdate', {
    users,
    gameState,
    liarGame: {
      topic: liarGame.topic,
      targetName: liarGame.targetName,
      winner: liarGame.winner,
      votesCount: Object.keys(liarGame.votes).length,
      execVotesCount: Object.keys(liarGame.execVotes).length,
      votes: liarGame.votes,
      execVotes: liarGame.execVotes,
      discussCount: liarGame.discussCount
    }
  });
};

const resetLiarGame = () => {
  liarGame = {
    topic: '', secretWord: '', liarName: '', votes: {}, execVotes: {}, targetName: '', winner: '', discussCount: 0
  };
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join Room
  socket.on('join', (name) => {
    let user = users.find(u => u.name === name);
    if (user) {
      user.id = socket.id;
      user.connected = true;
      socket.emit('joined', user);

      if (gameState === 'manitto') {
        socket.emit('manittoResult', manittoPairs[user.name]);
      } else if (['liar_role', 'liar_discuss', 'liar_vote', 'liar_exec_vote', 'liar_guess'].includes(gameState)) {
        const role = user.name === liarGame.liarName ? 'liar' : 'citizen';
        socket.emit('liarRoleResult', {
          role,
          word: role === 'citizen' ? liarGame.secretWord : null
        });
      }
      broadcastState();
      return;
    }

    if (users.length >= 8) {
      socket.emit('errorMsg', '방이 꽉 찼습니다. (최대 8명)');
      return;
    }
    if (gameState !== 'lobby') {
      socket.emit('errorMsg', '게임이 이미 진행중입니다.');
      return;
    }

    const isHost = users.length === 0;
    user = { id: socket.id, name, isHost, score: 0, connected: true };
    users.push(user);
    
    socket.emit('joined', user);
    broadcastState();
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const user = users.find(u => u.id === socket.id);
    if (user) user.connected = false;
    
    if (users.every(u => !u.connected)) {
      gameState = 'lobby';
      resetLiarGame();
      users = [];
    } else if (user && user.isHost) {
      user.isHost = false;
      const nextHost = users.find(u => u.connected);
      if (nextHost) nextHost.isHost = true;
    }
    broadcastState();
  });

  // --- Scoreboard ---
  socket.on('updateScore', ({ userId, scoreChange }) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.score += scoreChange;
      broadcastState();
    }
  });

  // --- Manitto ---
  socket.on('startManitto', () => {
    if (users.length < 2) return;
    gameState = 'manitto';
    
    // Mutual Pairing Algorithm
    let shuffled = [...users].sort(() => Math.random() - 0.5);
    manittoPairs = {};
    
    for (let i = 0; i < Math.floor(shuffled.length / 2); i++) {
      const u1 = shuffled[i * 2];
      const u2 = shuffled[i * 2 + 1];
      manittoPairs[u1.name] = u2.name;
      manittoPairs[u2.name] = u1.name;
    }
    // If odd, the last person is a pair with themselves or we make a 3-way circle
    if (shuffled.length % 2 !== 0) {
      const last = shuffled[shuffled.length - 1];
      const first = shuffled[0];
      const second = shuffled[1];
      // Break the first pair to make a 3-way cycle for the remaining 3
      manittoPairs[first.name] = second.name;
      manittoPairs[second.name] = last.name;
      manittoPairs[last.name] = first.name;
    }

    // Send manitto target to each user individually
    users.forEach(u => {
      if (u.connected) io.to(u.id).emit('manittoResult', manittoPairs[u.name]);
    });
    
    broadcastState();
  });

  // --- Liar Game ---
  socket.on('startLiarGame', () => {
    resetLiarGame();
    gameState = 'liar_topic';
    broadcastState();
  });

  socket.on('setLiarTopic', async (topic) => {
    gameState = 'liar_role';
    liarGame.topic = topic;
    broadcastState();

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set.");
      }
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `주제 '${topic}'에 관련된 단어 딱 1개만 명사 형태로 추천해줘. 부가 설명 없이 단어만 대답해.`;
      const result = await model.generateContent(prompt);
      liarGame.secretWord = result.response.text().trim();
    } catch (e) {
      console.error(e);
      liarGame.secretWord = '오류(기본단어)'; // Fallback
    }

    // Assign Roles
    let shuffled = [...users].sort(() => Math.random() - 0.5);
    liarGame.liarName = shuffled[0].name;

    users.forEach(u => {
      const role = u.name === liarGame.liarName ? 'liar' : 'citizen';
      if (u.connected) {
        io.to(u.id).emit('liarRoleResult', {
          role,
          word: role === 'citizen' ? liarGame.secretWord : null
        });
      }
    });
    
    gameState = 'liar_role';
    broadcastState();
  });

  socket.on('startDiscuss', () => {
    gameState = 'liar_discuss';
    broadcastState();
  });

  socket.on('endDiscuss', () => {
    gameState = 'liar_vote';
    broadcastState();
  });

  socket.on('voteLiar', (targetName) => {
    const voter = users.find(u => u.id === socket.id);
    if (!voter) return;
    liarGame.votes[voter.name] = targetName;
    
    // Check if everyone voted
    if (Object.keys(liarGame.votes).length === users.length) {
      // Count votes
      const counts = {};
      Object.values(liarGame.votes).forEach(name => {
        counts[name] = (counts[name] || 0) + 1;
      });
      
      let maxVotes = 0;
      let maxNames = [];
      for (const [name, count] of Object.entries(counts)) {
        if (count > maxVotes) {
          maxVotes = count;
          maxNames = [name];
        } else if (count === maxVotes) {
          maxNames.push(name);
        }
      }
      
      if (maxNames.length === 1) {
        liarGame.targetName = maxNames[0];
        gameState = 'liar_exec_vote';
      } else {
        liarGame.discussCount++;
        if (liarGame.discussCount >= 3) {
          liarGame.winner = 'liar'; // 3 ties = liar wins
          gameState = 'liar_result';
        } else {
          gameState = 'liar_discuss';
          liarGame.votes = {};
          liarGame.execVotes = {};
        }
      }
      broadcastState();
    } else {
      broadcastState(); // Update vote count
    }
  });

  socket.on('execVote', (execute) => {
    const voter = users.find(u => u.id === socket.id);
    if (!voter) return;
    liarGame.execVotes[voter.name] = execute;
    
    // Let's assume everyone votes.
    if (Object.keys(liarGame.execVotes).length === users.length) {
      const execCount = Object.values(liarGame.execVotes).filter(v => v).length;
      
      // execution threshold: over 50%
      if (execCount > users.length / 2) {
        // Execute target
        if (liarGame.targetName === liarGame.liarName) {
          gameState = 'liar_guess'; // Liar gets a chance to guess
        } else {
          liarGame.winner = 'liar'; // Wrong person executed
          gameState = 'liar_result';
        }
      } else {
        liarGame.discussCount++;
        if (liarGame.discussCount >= 3) {
          liarGame.winner = 'liar'; // Liar survived 3 times
          gameState = 'liar_result';
        } else {
          gameState = 'liar_discuss';
          liarGame.votes = {};
          liarGame.execVotes = {};
        }
      }
      broadcastState();
    } else {
      broadcastState();
    }
  });

  socket.on('liarGuess', (guessedWord) => {
    // Basic string match ignoring spaces
    const cleanGuess = guessedWord.replace(/\s+/g, '').toLowerCase();
    const cleanActual = liarGame.secretWord.replace(/\s+/g, '').toLowerCase();
    
    if (cleanGuess === cleanActual) {
      liarGame.winner = 'liar';
    } else {
      liarGame.winner = 'citizen';
    }
    gameState = 'liar_result';
    io.emit('liarRevealWord', liarGame.secretWord);
    broadcastState();
  });
  
  socket.on('backToLobby', () => {
    gameState = 'lobby';
    resetLiarGame();
    broadcastState();
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=========================================`);
  console.log(`Server listening on port ${PORT}`);
  console.log(`\n[접속 가능한 주소]`);
  
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // IPv4이고 내부망(로컬호스트)이 아닌 경우
      if (net.family === 'IPv4' && !net.internal) {
        // 와이파이나 핫스팟에서 주로 쓰이는 사설 IP 대역만 필터링 (192.168.*, 10.*, 172.16~31.*)
        if (net.address.startsWith('192.168.') || 
            net.address.startsWith('10.') || 
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)) {
          console.log(`👉 친구들 접속용 (같은 와이파이): http://${net.address}:${PORT}`);
        }
      }
    }
  }
  console.log(`👉 내 폰에서 접속할 때: http://localhost:${PORT}`);
  console.log(`=========================================\n`);
});
