import React, { useState, useEffect } from 'react';
import { Users, Plus, Play, X, Crown, Eye, EyeOff } from 'lucide-react';

export default function ImposterGame() {
  const [screen, setScreen] = useState('lobby'); // lobby, room, game, voting, results
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [votes, setVotes] = useState({});
  const [descriptions, setDescriptions] = useState({});
  const [newDescription, setNewDescription] = useState('');

  // Sample cards - in production, you'd load these from your images folder
  const cards = [
    { id: 1, name: 'Apple', emoji: '🍎' },
    { id: 2, name: 'Banana', emoji: '🍌' },
    { id: 3, name: 'Cat', emoji: '🐱' },
    { id: 4, name: 'Dog', emoji: '🐕' },
    { id: 5, name: 'Car', emoji: '🚗' },
    { id: 6, name: 'Tree', emoji: '🌳' },
    { id: 7, name: 'Beach', emoji: '🏖️' },
    { id: 8, name: 'Pizza', emoji: '🍕' },
  ];

  const createRoom = () => {
    if (!newRoomName.trim() || !playerName.trim()) return;
    
    const room = {
      id: Date.now(),
      name: newRoomName,
      host: playerName,
      players: [{ name: playerName, id: Date.now() }],
      status: 'waiting'
    };
    
    setRooms([...rooms, room]);
    setCurrentRoom(room);
    setScreen('room');
    setNewRoomName('');
  };

  const joinRoom = (room) => {
    if (!playerName.trim()) return;
    
    const player = { name: playerName, id: Date.now() };
    const updatedRoom = {
      ...room,
      players: [...room.players, player]
    };
    
    setRooms(rooms.map(r => r.id === room.id ? updatedRoom : r));
    setCurrentRoom(updatedRoom);
    setScreen('room');
  };

  const startGame = () => {
    if (!currentRoom || currentRoom.players.length < 3) return;
    
    // Pick random card and imposter
    const selectedCard = cards[Math.floor(Math.random() * cards.length)];
    const imposterIndex = Math.floor(Math.random() * currentRoom.players.length);
    
    const playerCards = currentRoom.players.map((player, idx) => ({
      playerId: player.id,
      playerName: player.name,
      card: idx === imposterIndex ? null : selectedCard,
      isImposter: idx === imposterIndex
    }));
    
    setGameState({
      card: selectedCard,
      playerCards,
      round: 1,
      allDescriptions: []
    });
    setCurrentRound(1);
    setScreen('game');
    setDescriptions({});
  };

  const submitDescription = () => {
    if (!newDescription.trim()) return;
    
    const myCard = gameState.playerCards.find(pc => pc.playerName === playerName);
    setDescriptions({
      ...descriptions,
      [playerName]: newDescription
    });
    
    const updatedDescriptions = [...gameState.allDescriptions, {
      player: playerName,
      text: newDescription,
      round: currentRound
    }];
    
    setGameState({
      ...gameState,
      allDescriptions: updatedDescriptions
    });
    
    setNewDescription('');
  };

  const goToVoting = () => {
    setVotes({});
    setScreen('voting');
  };

  const votePlayer = (votedPlayer) => {
    setVotes({
      ...votes,
      [playerName]: votedPlayer
    });
  };

  const voteContinue = () => {
    setVotes({
      ...votes,
      [playerName]: 'continue'
    });
  };

  const finishVoting = () => {
    const voteCount = {};
    let continueCount = 0;
    
    Object.values(votes).forEach(vote => {
      if (vote === 'continue') {
        continueCount++;
      } else {
        voteCount[vote] = (voteCount[vote] || 0) + 1;
      }
    });
    
    if (continueCount > Object.keys(votes).length / 2) {
      // Continue to next round
      setCurrentRound(currentRound + 1);
      setDescriptions({});
      setScreen('game');
    } else {
      // Check who got most votes
      const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
      const votedOut = sortedVotes[0]?.[0];
      
      const votedPlayer = gameState.playerCards.find(pc => pc.playerName === votedOut);
      
      setGameState({
        ...gameState,
        result: {
          votedOut,
          wasImposter: votedPlayer?.isImposter,
          imposter: gameState.playerCards.find(pc => pc.isImposter)?.playerName
        }
      });
      
      setScreen('results');
    }
  };

  const resetGame = () => {
    setScreen('lobby');
    setCurrentRoom(null);
    setGameState(null);
    setCurrentRound(0);
    setVotes({});
    setDescriptions({});
  };

  const myCard = gameState?.playerCards.find(pc => pc.playerName === playerName);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 p-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Lobby Screen */}
        {screen === 'lobby' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-800 mb-2">Imposter Card Game</h1>
              <p className="text-gray-600">Find the imposter among you!</p>
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter your name"
              />
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Create Room
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Room name"
                />
                <button
                  onClick={createRoom}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Available Rooms</h2>
              {rooms.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No rooms available. Create one!</p>
              ) : (
                <div className="space-y-3">
                  {rooms.map(room => (
                    <div key={room.id} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{room.name}</h3>
                        <p className="text-sm text-gray-600">
                          Host: {room.host} • {room.players.length} players
                        </p>
                      </div>
                      <button
                        onClick={() => joinRoom(room)}
                        className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Room Screen */}
        {screen === 'room' && currentRoom && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-gray-800">{currentRoom.name}</h1>
              <button
                onClick={() => setScreen('lobby')}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Players ({currentRoom.players.length})</h2>
              <div className="grid grid-cols-2 gap-3">
                {currentRoom.players.map(player => (
                  <div key={player.id} className="bg-purple-50 p-4 rounded-lg flex items-center gap-2">
                    {player.name === currentRoom.host && <Crown className="w-5 h-5 text-yellow-500" />}
                    <span className="font-medium">{player.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {playerName === currentRoom.host && (
              <button
                onClick={startGame}
                disabled={currentRoom.players.length < 3}
                className="w-full bg-purple-600 text-white py-4 rounded-lg hover:bg-purple-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold"
              >
                <Play className="w-6 h-6" />
                Start Game {currentRoom.players.length < 3 && '(Need 3+ players)'}
              </button>
            )}
          </div>
        )}

        {/* Game Screen */}
        {screen === 'game' && gameState && myCard && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Round {currentRound}</h1>
              <p className="text-gray-600">Describe your card without being too obvious!</p>
            </div>

            <div className="mb-8">
              <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-6 rounded-xl text-center">
                <button
                  onClick={() => setShowCard(!showCard)}
                  className="flex items-center justify-center gap-2 mx-auto mb-4 text-purple-700 hover:text-purple-900"
                >
                  {showCard ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  {showCard ? 'Hide' : 'Show'} Your Card
                </button>
                
                {showCard && (
                  <div className="bg-white p-8 rounded-lg shadow-lg">
                    {myCard.isImposter ? (
                      <div>
                        <p className="text-6xl mb-4">❓</p>
                        <p className="text-2xl font-bold text-red-600">You are the IMPOSTER!</p>
                        <p className="text-gray-600 mt-2">Blend in and try to guess the card!</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-6xl mb-4">{myCard.card.emoji}</p>
                        <p className="text-2xl font-bold">{myCard.card.name}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4">Descriptions This Round</h2>
              <div className="space-y-3 mb-4">
                {Object.entries(descriptions).map(([player, desc]) => (
                  <div key={player} className="bg-gray-50 p-4 rounded-lg">
                    <p className="font-semibold text-purple-600">{player}</p>
                    <p className="text-gray-700">{desc}</p>
                  </div>
                ))}
              </div>

              {!descriptions[playerName] && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Describe your card..."
                  />
                  <button
                    onClick={submitDescription}
                    className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition"
                  >
                    Submit
                  </button>
                </div>
              )}
            </div>

            {Object.keys(descriptions).length === currentRoom.players.length && (
              <button
                onClick={goToVoting}
                className="w-full bg-red-600 text-white py-4 rounded-lg hover:bg-red-700 transition text-lg font-semibold"
              >
                Proceed to Voting
              </button>
            )}
          </div>
        )}

        {/* Voting Screen */}
        {screen === 'voting' && gameState && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Voting Time!</h1>

            <div className="mb-8">
              <button
                onClick={voteContinue}
                className={`w-full p-6 rounded-lg border-2 mb-4 transition ${
                  votes[playerName] === 'continue'
                    ? 'bg-green-100 border-green-500'
                    : 'border-gray-300 hover:border-green-400'
                }`}
              >
                <p className="text-xl font-semibold">Continue Game</p>
                <p className="text-gray-600">Play another round</p>
              </button>

              <h2 className="text-xl font-semibold mb-4">Or Vote Out a Player</h2>
              <div className="grid grid-cols-2 gap-3">
                {gameState.playerCards.map(pc => (
                  <button
                    key={pc.playerId}
                    onClick={() => votePlayer(pc.playerName)}
                    className={`p-4 rounded-lg border-2 transition ${
                      votes[playerName] === pc.playerName
                        ? 'bg-red-100 border-red-500'
                        : 'border-gray-300 hover:border-red-400'
                    }`}
                  >
                    {pc.playerName}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-center text-gray-600">
                Votes cast: {Object.keys(votes).length} / {currentRoom.players.length}
              </p>
            </div>

            {Object.keys(votes).length === currentRoom.players.length && (
              <button
                onClick={finishVoting}
                className="w-full bg-purple-600 text-white py-4 rounded-lg hover:bg-purple-700 transition text-lg font-semibold"
              >
                Finish Voting
              </button>
            )}
          </div>
        )}

        {/* Results Screen */}
        {screen === 'results' && gameState?.result && (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <h1 className="text-4xl font-bold mb-6">
              {gameState.result.wasImposter ? '🎉 Game Over!' : '😱 Wrong Choice!'}
            </h1>

            <div className="bg-gray-50 p-6 rounded-xl mb-6">
              <p className="text-xl mb-4">
                <span className="font-semibold">{gameState.result.votedOut}</span> was voted out!
              </p>
              <p className="text-2xl font-bold">
                {gameState.result.wasImposter ? (
                  <span className="text-green-600">They WERE the imposter! ✅</span>
                ) : (
                  <span className="text-red-600">They were NOT the imposter! ❌</span>
                )}
              </p>
              {!gameState.result.wasImposter && (
                <p className="text-lg mt-4">
                  The imposter was: <span className="font-bold text-purple-600">{gameState.result.imposter}</span>
                </p>
              )}
            </div>

            <div className="bg-purple-50 p-6 rounded-xl mb-6">
              <p className="text-lg mb-2">The card was:</p>
              <p className="text-6xl mb-2">{gameState.card.emoji}</p>
              <p className="text-2xl font-bold">{gameState.card.name}</p>
            </div>

            <button
              onClick={resetGame}
              className="w-full bg-purple-600 text-white py-4 rounded-lg hover:bg-purple-700 transition text-lg font-semibold"
            >
              Back to Lobby
            </button>
          </div>
        )}
      </div>
    </div>
  );
}