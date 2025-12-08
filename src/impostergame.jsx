import React, { useState, useEffect } from 'react';
import { Users, Plus, Play, X, Crown, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import cardsData from './cards.json';

// Initialize Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ImposterGame() {
  const [screen, setScreen] = useState('lobby');
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(60);
  const [timerActive, setTimerActive] = useState(false);

  // Timer effect
  useEffect(() => {
    if (!timerActive || timer <= 0) return;

    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          setTimerActive(false);
          if (screen === 'game' && Object.keys(descriptions).length > 0) {
            goToVoting();
          } else if (screen === 'voting' && Object.keys(votes).length > 0) {
            finishVoting();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive, timer, screen]);

  // Fetch rooms on mount and subscribe to changes
  useEffect(() => {
    fetchRooms();
    
    const roomsSubscription = supabase
      .channel('rooms-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchRooms();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomsSubscription);
    };
  }, []);

  // Subscribe to current room updates
  useEffect(() => {
    if (!currentRoom) return;

    const subscription = supabase
      .channel(`room-${currentRoom.id}`)
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${currentRoom.id}` },
        (payload) => {
          setCurrentRoom(payload.new);
          
          // Auto-start game for all players when host starts
          if (payload.new.status === 'playing' && screen === 'room') {
            setScreen('game');
            setTimer(60);
            setTimerActive(true);
          }
          
          if (payload.new.game_state) {
            setGameState(payload.new.game_state);
            if (payload.new.game_state.round) {
              setCurrentRound(payload.new.game_state.round);
            }
            
            // Update descriptions for current round
            const currentRoundDescs = payload.new.game_state.allDescriptions?.filter(
              d => d.round === payload.new.game_state.round
            ) || [];
            const descObj = {};
            currentRoundDescs.forEach(d => {
              descObj[d.player] = d.text;
            });
            setDescriptions(descObj);
            
            // Sync votes
            if (payload.new.game_state.currentVotes) {
              setVotes(payload.new.game_state.currentVotes);
            }
            
            // Auto-move to voting screen
            if (payload.new.game_state.votingActive && screen === 'game') {
              setScreen('voting');
              setTimer(45);
              setTimerActive(true);
            }
            
            // Auto-move to game screen when new round starts
            if (payload.new.game_state.votingActive === false && screen === 'voting') {
              setScreen('game');
              setTimer(60);
              setTimerActive(true);
            }
            
            // Check if game finished
            if (payload.new.status === 'finished' && screen !== 'results') {
              setScreen('results');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [currentRoom?.id, screen]);

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
      setError('Failed to load rooms');
    }
  };

  const createRoom = async () => {
    if (!newRoomName.trim() || !playerName.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const room = {
        name: newRoomName,
        host: playerName,
        players: [{ name: playerName, id: Date.now() }],
        status: 'waiting',
        game_state: null
      };
      
      const { data, error } = await supabase
        .from('rooms')
        .insert([room])
        .select()
        .single();
      
      if (error) throw error;
      
      setCurrentRoom(data);
      setScreen('room');
      setNewRoomName('');
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (room) => {
    if (!playerName.trim()) return;
    
    // Check if player name already exists in room
    if (room.players.some(p => p.name === playerName)) {
      setError('A player with this name already exists in the room');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Fetch latest room data to avoid overwriting
      const { data: latestRoom, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const player = { name: playerName, id: Date.now() };
      const updatedPlayers = [...latestRoom.players, player];
      
      const { data, error } = await supabase
        .from('rooms')
        .update({ players: updatedPlayers })
        .eq('id', room.id)
        .select()
        .single();
      
      if (error) throw error;
      
      setCurrentRoom(data);
      setScreen('room');
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    if (!currentRoom || currentRoom.players.length < 3) return;
    
    setLoading(true);
    
    try {
      const selectedCard = cardsData.cards[Math.floor(Math.random() * cardsData.cards.length)];
      const imposterIndex = Math.floor(Math.random() * currentRoom.players.length);
      
      const playerCards = currentRoom.players.map((player, idx) => ({
        playerId: player.id,
        playerName: player.name,
        card: idx === imposterIndex ? null : selectedCard,
        isImposter: idx === imposterIndex
      }));
      
      const newGameState = {
        card: selectedCard,
        playerCards,
        round: 1,
        allDescriptions: [],
        currentVotes: {}
      };
      
      const { data, error } = await supabase
        .from('rooms')
        .update({ 
          status: 'playing',
          game_state: newGameState 
        })
        .eq('id', currentRoom.id)
        .select()
        .single();
      
      if (error) throw error;
      
      setGameState(newGameState);
      setCurrentRound(1);
      setScreen('game');
      setDescriptions({});
      setTimer(60);
      setTimerActive(true);
    } catch (err) {
      console.error('Error starting game:', err);
      setError('Failed to start game');
    } finally {
      setLoading(false);
    }
  };

  const submitDescription = async () => {
    if (!newDescription.trim()) return;
    
    try {
      // Fetch latest state to avoid overwriting other descriptions
      const { data: latestRoom, error: fetchError } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('id', currentRoom.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const existingDescriptions = latestRoom.game_state?.allDescriptions || [];
      
      // Check if this player already submitted for this round
      const alreadySubmitted = existingDescriptions.some(
        d => d.player === playerName && d.round === currentRound
      );
      
      if (alreadySubmitted) {
        setError('You already submitted a description for this round');
        return;
      }
      
      const updatedDescriptions = [...existingDescriptions, {
        player: playerName,
        text: newDescription,
        round: currentRound
      }];
      
      const updatedGameState = {
        ...latestRoom.game_state,
        allDescriptions: updatedDescriptions
      };
      
      const { error } = await supabase
        .from('rooms')
        .update({ game_state: updatedGameState })
        .eq('id', currentRoom.id);
      
      if (error) throw error;
      
      setDescriptions({
        ...descriptions,
        [playerName]: newDescription
      });
      setNewDescription('');
    } catch (err) {
      console.error('Error submitting description:', err);
      setError('Failed to submit description');
    }
  };

  const goToVoting = async () => {
    setScreen('voting');
    setTimer(45);
    setTimerActive(true);
    
    // Clear votes in database for new voting round
    try {
      const updatedGameState = {
        ...gameState,
        currentVotes: {},
        votingActive: true
      };
      
      await supabase
        .from('rooms')
        .update({ game_state: updatedGameState })
        .eq('id', currentRoom.id);
        
      setVotes({});
    } catch (err) {
      console.error('Error clearing votes:', err);
    }
  };

  const votePlayer = async (votedPlayer) => {
    // First fetch the latest game state from database
    try {
      const { data: latestRoom, error: fetchError } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('id', currentRoom.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const currentVotes = latestRoom.game_state?.currentVotes || {};
      const newVotes = {
        ...currentVotes,
        [playerName]: votedPlayer
      };
      
      setVotes(newVotes);
      
      const updatedGameState = {
        ...latestRoom.game_state,
        currentVotes: newVotes
      };
      
      await supabase
        .from('rooms')
        .update({ game_state: updatedGameState })
        .eq('id', currentRoom.id);
    } catch (err) {
      console.error('Error saving vote:', err);
      setError('Failed to save vote');
    }
  };

  const voteContinue = async () => {
    // First fetch the latest game state from database
    try {
      const { data: latestRoom, error: fetchError } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('id', currentRoom.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const currentVotes = latestRoom.game_state?.currentVotes || {};
      const newVotes = {
        ...currentVotes,
        [playerName]: 'continue'
      };
      
      setVotes(newVotes);
      
      const updatedGameState = {
        ...latestRoom.game_state,
        currentVotes: newVotes
      };
      
      await supabase
        .from('rooms')
        .update({ game_state: updatedGameState })
        .eq('id', currentRoom.id);
    } catch (err) {
      console.error('Error saving vote:', err);
      setError('Failed to save vote');
    }
  };

  const finishVoting = async () => {
    setTimerActive(false);
    
    // Fetch latest votes to ensure we have all of them
    try {
      const { data: latestRoom, error: fetchError } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('id', currentRoom.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const finalVotes = latestRoom.game_state?.currentVotes || {};
      
      const voteCount = {};
      let continueCount = 0;
      
      Object.values(finalVotes).forEach(vote => {
        if (vote === 'continue') {
          continueCount++;
        } else {
          voteCount[vote] = (voteCount[vote] || 0) + 1;
        }
      });
      
      if (continueCount > Object.keys(finalVotes).length / 2) {
        // Continue to next round - all players go back to game
        const updatedGameState = {
          ...latestRoom.game_state,
          round: currentRound + 1,
          currentVotes: {},
          votingActive: false
        };
        
        await supabase
          .from('rooms')
          .update({ game_state: updatedGameState })
          .eq('id', currentRoom.id);
          
        setCurrentRound(currentRound + 1);
        setDescriptions({});
        setScreen('game');
        setTimer(60);
        setTimerActive(true);
      } else {
        const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
        const votedOut = sortedVotes[0]?.[0];
        
        const votedPlayer = latestRoom.game_state.playerCards.find(pc => pc.playerName === votedOut);
        
        const updatedGameState = {
          ...latestRoom.game_state,
          result: {
            votedOut,
            wasImposter: votedPlayer?.isImposter,
            imposter: latestRoom.game_state.playerCards.find(pc => pc.isImposter)?.playerName
          }
        };
        
        await supabase
          .from('rooms')
          .update({ 
            status: 'finished',
            game_state: updatedGameState 
          })
          .eq('id', currentRoom.id);
        
        setGameState(updatedGameState);
        setScreen('results');
      }
    } catch (err) {
      console.error('Error finishing voting:', err);
      setError('Failed to finish voting');
    }
  };

  const resetGame = async () => {
    setTimerActive(false);
    
    if (currentRoom) {
      try {
        await supabase
          .from('rooms')
          .delete()
          .eq('id', currentRoom.id);
      } catch (err) {
        console.error('Error deleting room:', err);
      }
    }
    
    setScreen('lobby');
    setCurrentRoom(null);
    setGameState(null);
    setCurrentRound(0);
    setVotes({});
    setDescriptions({});
    setTimer(60);
    fetchRooms();
  };

  const myCard = gameState?.playerCards.find(pc => pc.playerName === playerName);

  // Get descriptions for current round
  const currentRoundDescriptions = gameState?.allDescriptions.filter(d => d.round === currentRound) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 p-4">
      <div className="max-w-4xl mx-auto">
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

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
                  disabled={loading}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition flex items-center gap-2 disabled:bg-gray-400"
                >
                  <Plus className="w-5 h-5" />
                  {loading ? 'Creating...' : 'Create'}
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
                        disabled={loading}
                        className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition disabled:bg-gray-400"
                      >
                        {loading ? 'Joining...' : 'Join'}
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
                disabled={currentRoom.players.length < 3 || loading}
                className="w-full bg-purple-600 text-white py-4 rounded-lg hover:bg-purple-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold"
              >
                <Play className="w-6 h-6" />
                {loading ? 'Starting...' : `Start Game ${currentRoom.players.length < 3 ? '(Need 3+ players)' : ''}`}
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
              {timerActive && (
                <div className="mt-4">
                  <div className="text-2xl font-bold text-purple-600">
                    ⏱️ {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              )}
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
                        <img 
                          src={myCard.card.image} 
                          alt={myCard.card.name}
                          className="w-48 h-48 object-contain mx-auto mb-4 rounded-lg"
                        />
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
                {currentRoundDescriptions.map((desc, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                    <p className="font-semibold text-purple-600">{desc.player}</p>
                    <p className="text-gray-700">{desc.text}</p>
                  </div>
                ))}
              </div>

              {!currentRoundDescriptions.find(d => d.player === playerName) && (
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

            {currentRoundDescriptions.length === currentRoom.players.length && playerName === currentRoom.host && (
              <button
                onClick={goToVoting}
                className="w-full bg-red-600 text-white py-4 rounded-lg hover:bg-red-700 transition text-lg font-semibold"
              >
                Proceed to Voting (Host Only)
              </button>
            )}
            
            {currentRoundDescriptions.length === currentRoom.players.length && playerName !== currentRoom.host && (
              <div className="text-center text-gray-600 py-4">
                Waiting for host to start voting...
              </div>
            )}
          </div>
        )}

        {/* Voting Screen */}
        {screen === 'voting' && gameState && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">Voting Time!</h1>
            {timerActive && (
              <div className="text-center mb-6">
                <div className="text-2xl font-bold text-red-600">
                  ⏱️ {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                </div>
              </div>
            )}

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

            {playerName === currentRoom.host && Object.keys(votes).length === currentRoom.players.length && (
              <button
                onClick={finishVoting}
                className="w-full bg-purple-600 text-white py-4 rounded-lg hover:bg-purple-700 transition text-lg font-semibold"
              >
                Finish Voting (Host Only)
              </button>
            )}

            {playerName !== currentRoom.host && Object.keys(votes).length === currentRoom.players.length && (
              <div className="text-center text-gray-600 py-4">
                Waiting for host to finish voting...
              </div>
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
              <img 
                src={gameState.card.image} 
                alt={gameState.card.name}
                className="w-48 h-48 object-contain mx-auto mb-4 rounded-lg"
              />
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