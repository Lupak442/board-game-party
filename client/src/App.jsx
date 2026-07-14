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
  const [speedQuizInfo, setSpeedQuizInfo] = useState({});
  const [guessWord, setGuessWord] = useState('');

  useEffect(() => {
    socket.on('joined', (u) => setUser(u));
    socket.on('errorMsg', (msg) => alert(msg));
    
    socket.on('stateUpdate', (state) => {
      setUsers(state.users);
      setGameState(state.gameState);
      setLiarGameInfo(state.liarGame);
      setLiarGameInfo(prev => ({ ...prev, maxPlayers: state.maxPlayers }));
      setSpeedQuizInfo(state.speedQuiz || {});
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
                  min="3" max="12" 
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
                <button style={{width: '100%', marginTop: '0.5rem', background: '#8b5cf6', color: 'white'}} onClick={() => socket.emit('startSpeedQuizSetup')}>팀전 스피드 퀴즈</button>
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

        {/* --- Speed Quiz --- */}
        {gameState === 'speed_team_select' && (
          <>
            <h2>스피드 퀴즈 설정</h2>
            <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
              <div style={{flex: 1, background: 'rgba(244,63,94,0.1)', padding: '1rem', borderRadius: '10px'}}>
                <h3 style={{color: 'var(--accent-color)'}}>A 팀</h3>
                <ul style={{listStyle: 'none', padding: 0}}>
                  {users.filter(u => speedQuizInfo?.teams?.[u.id] === 'A').map(u => (
                    <li key={u.id} style={{marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>{u.name}</span>
                      {isHost && <button style={{padding: '0.2rem 0.5rem', fontSize: '0.7rem'}} onClick={() => socket.emit('setSpeedTeam', {userId: u.id, team: 'B'})}>B팀으로 ➡️</button>}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{flex: 1, background: 'rgba(59,130,246,0.1)', padding: '1rem', borderRadius: '10px'}}>
                <h3 style={{color: '#3b82f6'}}>B 팀</h3>
                <ul style={{listStyle: 'none', padding: 0}}>
                  {users.filter(u => speedQuizInfo?.teams?.[u.id] === 'B').map(u => (
                    <li key={u.id} style={{marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      {isHost && <button style={{padding: '0.2rem 0.5rem', fontSize: '0.7rem'}} onClick={() => socket.emit('setSpeedTeam', {userId: u.id, team: 'A'})}>⬅️ A팀으로</button>}
                      <span>{u.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {isHost && (
              <div style={{marginTop: '2rem'}}>
                <label style={{display: 'block', marginBottom: '0.5rem'}}>제한 시간 설정: <strong>{speedQuizInfo?.timerSetting}초</strong></label>
                <input 
                  type="range" min="60" max="180" step="30" 
                  value={speedQuizInfo?.timerSetting || 60} 
                  onChange={(e) => socket.emit('setSpeedTimer', parseInt(e.target.value))}
                  style={{width: '100%', marginBottom: '1.5rem'}}
                />
                <label style={{display: 'block', marginBottom: '0.5rem'}}>문제 개수 설정: <strong>{speedQuizInfo?.wordCountSetting || 24}개</strong> (팀당 {(speedQuizInfo?.wordCountSetting || 24) / 2}개)</label>
                <input 
                  type="range" min="10" max="60" step="2" 
                  value={speedQuizInfo?.wordCountSetting || 24} 
                  onChange={(e) => socket.emit('setSpeedWordCount', parseInt(e.target.value))}
                  style={{width: '100%', marginBottom: '1.5rem', accentColor: '#10b981'}}
                />
                
                <button onClick={() => socket.emit('goSpeedTopic')}>주제 선정하기</button>
              </div>
            )}
            {!isHost && <p style={{marginTop: '2rem'}}>방장이 팀과 시간을 설정 중입니다...</p>}
          </>
        )}

        {gameState === 'speed_topic' && (
          <>
            <h2>스피드 퀴즈 주제</h2>
            <p>방장이 주제를 선정중입니다...</p>
            {isHost && (
              <div style={{marginTop: '2rem'}}>
                <input 
                  type="text" 
                  placeholder="예: 유명 영화, 속담, 사자성어" 
                  value={liarTopic} 
                  onChange={(e) => setLiarTopic(e.target.value)} 
                />
                <button onClick={() => socket.emit('setSpeedTopic', liarTopic)}>단어 생성 (총 {speedQuizInfo?.wordCountSetting || 24}개)</button>
              </div>
            )}
          </>
        )}

        {gameState === 'speed_loading' && (
          <div style={{textAlign: 'center', padding: '2rem 0'}}>
            <h2>단어 생성 중...</h2>
            <p style={{marginTop: '1rem'}}>AI가 주제에 맞는 {speedQuizInfo?.wordCountSetting || 24}개의 단어를<br/>열심히 생성하고 있습니다.</p>
          </div>
        )}

        {gameState === 'speed_ready' && (
          <>
            <h2>준비!</h2>
            <div className="secret-word" style={{color: speedQuizInfo?.currentTurn === 'A' ? 'var(--accent-color)' : '#3b82f6'}}>
              {speedQuizInfo?.currentTurn} 팀 차례입니다
            </div>
            {isHost ? (
              <button style={{marginTop: '2rem', padding: '1rem', fontSize: '1.2rem'}} onClick={() => socket.emit('startSpeedTurn')}>타이머 시작!</button>
            ) : (
              <p style={{marginTop: '2rem'}}>방장이 타이머를 시작하기를 기다리는 중...</p>
            )}
          </>
        )}

        {gameState.startsWith('speed_playing') && (() => {
          const word = speedQuizInfo?.currentWord || '종료';
          const fontSize = word.length > 15 ? '1.5rem' : word.length > 8 ? '2rem' : '3rem';
          
          return (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: 'bold'}}>
                <span style={{color: speedQuizInfo?.timeLeft <= 10 ? 'var(--accent-color)' : 'inherit'}}>⏳ {speedQuizInfo?.timeLeft}초</span>
                <span>{speedQuizInfo?.currentIndex + 1} / {speedQuizInfo?.totalWords}</span>
              </div>
              
              <div style={{textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '15px', marginBottom: '2rem', minHeight: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <h1 style={{fontSize, margin: 0, wordBreak: 'keep-all', lineHeight: '1.3'}}>{word}</h1>
              </div>

              <div style={{display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '2rem'}}>
                <div style={{textAlign: 'center'}}>
                  <div style={{fontSize: '0.9rem', color: '#ccc'}}>A팀 점수</div>
                  <div style={{fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent-color)'}}>{speedQuizInfo?.scoreA}</div>
                </div>
                <div style={{textAlign: 'center'}}>
                  <div style={{fontSize: '0.9rem', color: '#ccc'}}>B팀 점수</div>
                  <div style={{fontSize: '1.8rem', fontWeight: 'bold', color: '#3b82f6'}}>{speedQuizInfo?.scoreB}</div>
                </div>
              </div>

              {isHost ? (
                <div style={{display: 'flex', gap: '1rem'}}>
                  <button className="danger" style={{flex: 1, padding: '1.5rem', fontSize: '1.2rem'}} onClick={() => socket.emit('speedPass')}>패스 ⏭️</button>
                  <button style={{flex: 1, padding: '1.5rem', fontSize: '1.2rem', background: '#22c55e', borderColor: '#22c55e'}} onClick={() => socket.emit('speedCorrect')}>정답 ✅</button>
                </div>
              ) : (
                <p style={{textAlign: 'center', color: '#ccc'}}>방장이 정답 여부를 판정합니다...</p>
              )}
            </>
          );
        })()}

        {gameState === 'speed_result' && (
          <>
            <h2>게임 종료!</h2>
            <div style={{display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem'}}>
              <div style={{textAlign: 'center', flex: 1, background: 'rgba(244,63,94,0.1)', padding: '2rem 1rem', borderRadius: '15px'}}>
                <h3 style={{color: 'var(--accent-color)', margin: 0}}>A 팀</h3>
                <div style={{fontSize: '3rem', fontWeight: 'bold', margin: '1rem 0'}}>{speedQuizInfo?.scoreA}점</div>
              </div>
              <div style={{textAlign: 'center', flex: 1, background: 'rgba(59,130,246,0.1)', padding: '2rem 1rem', borderRadius: '15px'}}>
                <h3 style={{color: '#3b82f6', margin: 0}}>B 팀</h3>
                <div style={{fontSize: '3rem', fontWeight: 'bold', margin: '1rem 0'}}>{speedQuizInfo?.scoreB}점</div>
              </div>
            </div>
            
            <div className="secret-word" style={{marginTop: '2rem'}}>
              {speedQuizInfo?.scoreA > speedQuizInfo?.scoreB ? 'A팀 우승! 🎉' : 
               speedQuizInfo?.scoreB > speedQuizInfo?.scoreA ? 'B팀 우승! 🎉' : '무승부! 🤝'}
            </div>

            {isHost && <button style={{marginTop: '2rem'}} onClick={() => socket.emit('backToLobby')}>로비로 돌아가기</button>}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
