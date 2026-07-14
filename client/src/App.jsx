import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socketUrl = window.location.port === '5173' || window.location.port === '3000' 
  ? 'http://localhost:3001' 
  : window.location.origin;

const socket = io(socketUrl);

const FlipCard = ({ frontText, backText, isLiar }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className={`flip-card ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
      <div className="flip-card-inner">
        <div className="flip-card-front">
          <p>{frontText}</p>
        </div>
        <div className={`flip-card-back ${isLiar ? 'liar-bg' : ''}`}>
          <p>{backText}</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [name, setName] = useState('');
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [gameState, setGameState] = useState('lobby');
  const [manittoTarget, setManittoTarget] = useState(null);
  
  const [liarTopic, setLiarTopic] = useState('');
  const [liarRole, setLiarRole] = useState(null);
  const [liarWord, setLiarWord] = useState('');
  const [liarGameInfo, setLiarGameInfo] = useState({});
  const [guessWord, setGuessWord] = useState('');

  useEffect(() => {
    socket.on('joined', (u) => setUser(u));
    socket.on('errorMsg', (msg) => alert(msg));
    
    socket.on('stateUpdate', (state) => {
      setUsers(state.users);
      setGameState(state.gameState);
      setLiarGameInfo(state.liarGame);
      setLiarGameInfo(prev => ({ ...prev, maxPlayers: state.maxPlayers }));
    });

    socket.on('globalState', (state) => {
      // We can also just send maxPlayers in stateUpdate as we did in server.js
    });

    socket.on('manittoResult', (target) => {
      setManittoTarget(target);
    });

    socket.on('liarRoleResult', ({ role, word }) => {
      setLiarRole(role);
      setLiarWord(word);
    });

    socket.on('liarRevealWord', (word) => {
      setLiarWord(word);
    });

    return () => {
      socket.off('joined');
      socket.off('errorMsg');
      socket.off('stateUpdate');
      socket.off('manittoResult');
      socket.off('liarRoleResult');
      socket.off('liarRevealWord');
    };
  }, []);

  const handleJoin = () => {
    if (name.trim() === '') return;
    socket.emit('join', name);
  };

  const isHost = users.find(u => u.id === user?.id)?.isHost;

  if (!user) {
    return (
      <div className="app-container">
        <div className="glass-card">
          <h1>보드게임 파티</h1>
          <input 
            type="text" 
            placeholder="이름을 입력하세요" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin}>입장하기</button>
        </div>
      </div>
    );
  }

  const updateScore = (id, change) => {
    socket.emit('updateScore', { userId: id, scoreChange: change });
  };

  const sortedUsers = isHost ? users : [...users].sort((a, b) => b.score - a.score);

  return (
    <div className="app-container">
      <div className="glass-card">
        <h2>안녕하세요, {user.name}님! {isHost && <span className="badge">방장</span>}</h2>
        
        {gameState === 'lobby' && (
          <>
            <h3>접속자 목록 ({users.length}/{liarGameInfo.maxPlayers || 8})</h3>
            
            {isHost && (
              <div style={{marginBottom: '1rem', background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '10px'}}>
                <label style={{display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem'}}>
                  최대 인원 설정: <strong>{liarGameInfo.maxPlayers || 8}명</strong>
                </label>
                <input 
                  type="range" 
                  min="3" max="8" 
                  value={liarGameInfo.maxPlayers || 8} 
                  onChange={(e) => socket.emit('setMaxPlayers', parseInt(e.target.value))} 
                  style={{width: '100%', accentColor: 'var(--accent-color)'}} 
                />
              </div>
            )}

            <ul>
              {sortedUsers.map((u, index) => {
                let rankClass = '';
                if (!isHost) {
                  if (index === 0) rankClass = 'rank-1';
                  else if (index === 1) rankClass = 'rank-2';
                  else if (index === 2) rankClass = 'rank-3';
                  else if (index >= 5) rankClass = 'rank-bottom';
                }
                return (
                  <li key={u.id} className={`user-list-item ${rankClass}`}>
                    <span>{u.name} {u.isHost && '👑'}</span>
                    <span>{u.score} 점</span>
                    {isHost && (
                      <div className="score-control">
                        <button className="score-btn danger" onClick={() => updateScore(u.id, -1)}>-</button>
                        <button className="score-btn" onClick={() => updateScore(u.id, 1)}>+</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            
            {isHost && (
              <div style={{marginTop: '2rem'}}>
                <button style={{width: '100%', marginBottom: '0.5rem'}} onClick={() => socket.emit('startManitto')}>마니또 뽑기</button>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <button className="danger" style={{flex: 1}} onClick={() => socket.emit('startLiarGame', 'normal')}>일반 라이어 게임</button>
                  <button className="primary" style={{flex: 1}} onClick={() => socket.emit('startLiarGame', 'idiot')}>바보 라이어 게임</button>
                </div>
              </div>
            )}
          </>
        )}

        {gameState === 'manitto' && (
          <>
            <h2>당신의 마니또는...</h2>
            <FlipCard 
              frontText="터치해서 마니또 확인하기"
              backText={manittoTarget}
            />
            <p style={{marginTop: '1rem'}}>서로가 서로의 마니또입니다!</p>
            {isHost && <button style={{marginTop: '2rem'}} onClick={() => socket.emit('backToLobby')}>로비로 돌아가기</button>}
          </>
        )}

        {gameState === 'liar_topic' && (
          <>
            <h2>라이어 게임</h2>
            <p>방장이 주제를 선정중입니다...</p>
            {isHost && (
              <div style={{marginTop: '2rem'}}>
                <input 
                  type="text" 
                  placeholder="예: 과일, 동물, 가전제품" 
                  value={liarTopic} 
                  onChange={(e) => setLiarTopic(e.target.value)} 
                />
                <button onClick={() => socket.emit('setLiarTopic', liarTopic)}>주제 확정 및 단어 생성</button>
              </div>
            )}
          </>
        )}

        {gameState === 'liar_role' && (
          <>
            <h2>역할 확인</h2>
            <p>주제: <strong>{liarGameInfo.topic}</strong></p>
            <FlipCard 
              frontText="터치해서 역할 확인하기"
              backText={liarGameInfo.mode === 'idiot' 
                ? `당신의 단어: ${liarWord}`
                : (liarRole === 'liar' ? '당신은 라이어입니다' : `시민: ${liarWord}`)
              }
              isLiar={liarGameInfo.mode !== 'idiot' && liarRole === 'liar'}
            />
            {isHost && <button style={{marginTop: '2rem'}} onClick={() => socket.emit('startDiscuss')}>역할 확인 완료 (토론으로)</button>}
          </>
        )}

        {gameState === 'liar_discuss' && (
          <>
            <h2>토론 시간</h2>
            {liarGameInfo.discussCount > 0 && (
               <div style={{marginBottom: '1rem', color: '#fbbf24', fontWeight: 'bold'}}>
                 ⚠️ 재투표 진행중 (현재 {liarGameInfo.discussCount}번 무산 / 3번 무산 시 라이어 승리)
               </div>
            )}
            <p>자신의 정체를 숨기며 단어에 대해 한 마디씩 하세요!</p>
            {isHost && <button className="danger" onClick={() => socket.emit('endDiscuss')}>토론 종료 및 투표 시작</button>}
          </>
        )}

        {gameState === 'liar_vote' && (
          <>
            <h2>라이어 투표</h2>
            <p>라이어로 의심되는 사람을 선택하세요. ({liarGameInfo.votesCount}/{users.length}명 투표 완료)</p>
            <ul>
              {users.map(u => {
                const voters = Object.entries(liarGameInfo.votes || {})
                  .filter(([voterName, targetName]) => targetName === u.name)
                  .map(([voterName]) => voterName);
                
                return (
                  <li key={u.id} className="vote-item" onClick={() => socket.emit('voteLiar', u.name)}>
                    <div>{u.name} 지목하기</div>
                    {voters.length > 0 && (
                      <div style={{marginTop: '0.5rem'}}>
                        {voters.map(v => <span key={v} className="voter-tag">{v}</span>)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {gameState === 'liar_exec_vote' && (() => {
          const yesVoters = Object.entries(liarGameInfo.execVotes || {})
            .filter(([name, isYes]) => isYes)
            .map(([name]) => name);
          const noVoters = Object.entries(liarGameInfo.execVotes || {})
            .filter(([name, isYes]) => !isYes)
            .map(([name]) => name);

          return (
            <>
              <h2>처형 찬반 투표</h2>
              <p>의심받는 사람: <strong>{liarGameInfo.targetName}</strong></p>
              <p>({liarGameInfo.execVotesCount}/{users.length}명 투표 완료)</p>
              <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                <div style={{flex: 1}}>
                  <button className="danger" style={{width: '100%'}} onClick={() => socket.emit('execVote', true)}>처형 찬성</button>
                  <div style={{marginTop: '0.5rem', minHeight: '30px'}}>
                    {yesVoters.map(v => <span key={v} className="voter-tag">{v}</span>)}
                  </div>
                </div>
                <div style={{flex: 1}}>
                  <button style={{width: '100%'}} onClick={() => socket.emit('execVote', false)}>처형 반대</button>
                  <div style={{marginTop: '0.5rem', minHeight: '30px'}}>
                    {noVoters.map(v => <span key={v} className="voter-tag">{v}</span>)}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {gameState === 'liar_guess' && (
          <>
            <h2>라이어 최후의 변론</h2>
            <p>당신은 라이어로 지목되어 처형되었습니다!</p>
            {liarRole === 'liar' ? (
              <div>
                <p>제시어를 맞춰보세요!</p>
                <input 
                  type="text" 
                  placeholder="제시어 입력" 
                  value={guessWord} 
                  onChange={(e) => setGuessWord(e.target.value)} 
                />
                <button onClick={() => socket.emit('liarGuess', guessWord)}>정답 제출</button>
              </div>
            ) : (
              <p>라이어가 제시어를 입력 중입니다...</p>
            )}
          </>
        )}

        {gameState === 'liar_result' && (
          <>
            <h2>게임 결과</h2>
            <div className="secret-word">
              {liarGameInfo.winner === 'liar' ? '라이어 승리!' : '시민 승리!'}
            </div>
            {liarGameInfo.mode === 'idiot' ? (
              <div style={{marginTop: '1rem'}}>
                <p>시민 단어: <strong>{liarGameInfo.secretWord}</strong></p>
                <p>라이어 단어: <strong>{liarGameInfo.liarWord}</strong></p>
                <p style={{marginTop: '0.5rem', fontSize: '0.9rem', color: '#ccc'}}>(내 역할: {liarRole === 'liar' ? '라이어' : '시민'})</p>
              </div>
            ) : (
              <p>제시어: <strong>{liarGameInfo.secretWord}</strong></p>
            )}
            {isHost && <button style={{marginTop: '2rem'}} onClick={() => socket.emit('backToLobby')}>로비로 돌아가기</button>}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
