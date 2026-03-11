/**
 * Main App Component for Ellen Skill Frontend
 *
 * Integrates Live2D canvas, WebSocket connection, audio playback,
 * and provides the user interface for interacting with Ellen.
 */

import { useState, useCallback } from 'react';
import { useEllenSkill } from './hooks/useEllenSkill';
import { Live2DCanvas } from './components/Live2DCanvas';
import './App.css';

/**
 * Connection status indicator component
 */
function StatusIndicator({ status }: { status: string }) {
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return '#4ade80';
      case 'connecting':
        return '#fbbf24';
      case 'disconnected':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  return (
    <div className="status-indicator">
      <span
        className="status-dot"
        style={{ backgroundColor: getStatusColor() }}
      />
      <span className="status-text">{status}</span>
    </div>
  );
}

/**
 * Main App component
 */
function App() {
  const {
    connectionStatus,
    currentText,
    currentExpression,
    isSpeaking,
    audioInitialized,
    initializeAudio,
    sendMessage,
    reconnect,
    getExpressionParams,
  } = useEllenSkill();

  const [inputText, setInputText] = useState('');
  const [showStartButton, setShowStartButton] = useState(true);

  /**
   * Handle start button click
   */
  const handleStart = useCallback(() => {
    const success = initializeAudio();
    if (success) {
      setShowStartButton(false);
    }
  }, [initializeAudio]);

  /**
   * Handle send message
   */
  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;

    const success = sendMessage(inputText.trim());
    if (success) {
      setInputText('');
    }
  }, [inputText, sendMessage]);

  /**
   * Handle key press
   */
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>エレン・ジョー AI Companion</h1>
        <StatusIndicator status={connectionStatus} />
      </header>

      <main className="app-main">
        {/* Live2D Canvas */}
        <div className="canvas-container">
          <Live2DCanvas
            modelPath="/Shark/shark.model3.json"
            motionId={isSpeaking ? 'idle2' : 'idle'}
            getExpressionParams={getExpressionParams}
            width={800}
            height={600}
          />

          {/* Start Button Overlay */}
          {showStartButton && (
            <div className="start-overlay">
              <button className="start-button" onClick={handleStart}>
                Click to Start (音声を有効化)
              </button>
            </div>
          )}
        </div>

        {/* Character Info Panel */}
        <div className="info-panel">
          <div className="expression-badge">
            Expression: {currentExpression}
          </div>
          {isSpeaking && (
            <div className="speaking-indicator">Speaking...</div>
          )}
        </div>

        {/* Dialogue Display */}
        <div className="dialogue-box">
          <div className="dialogue-text">
            {currentText || 'Waiting for message...'}
          </div>
        </div>

        {/* Input Area */}
        <div className="input-area">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type your message... (メッセージを入力)"
            rows={2}
            disabled={connectionStatus !== 'connected'}
          />
          <div className="button-group">
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || connectionStatus !== 'connected'}
              className="send-button"
            >
              Send
            </button>
            <button
              onClick={reconnect}
              disabled={connectionStatus === 'connected'}
              className="reconnect-button"
            >
              Reconnect
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions">
          <p>
            Ellen Joe (エレン・ジョー) - AI Companion powered by GPT-SoVITS v4
          </p>
          <p className="status-info">
            Audio: {audioInitialized ? 'Initialized' : 'Not initialized'} |
            WS: {connectionStatus}
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
