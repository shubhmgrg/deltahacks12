import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { MessageCircle, X, Send, Loader2, Minimize2, Maximize2 } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function AgentChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Setup Socket.io connection
  useEffect(() => {
    if (!isOpen) return;
    
    const newSocket = io(`${BACKEND_URL}/agent`, {
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      console.log('Connected to agent');
      setIsConnected(true);
    });
    
    newSocket.on('disconnect', () => {
      console.log('Disconnected from agent');
      setIsConnected(false);
    });
    
    newSocket.on('message', (data) => {
      setMessages(prev => [...prev, data]);
      setIsTyping(false);
    });
    
    newSocket.on('typing', (isTyping) => {
      setIsTyping(isTyping);
    });
    
    newSocket.on('error', (error) => {
      console.error('Agent error:', error);
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'system',
        content: error.message || 'An error occurred',
        timestamp: new Date().toISOString()
      }]);
      setIsTyping(false);
    });
    
    newSocket.on('execution-result', (data) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: `Query executed successfully! Found ${data.count} results.`,
        data: data.data,
        timestamp: data.timestamp
      }]);
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, [isOpen]);
  
  const handleSendMessage = () => {
    if (!inputMessage.trim() || !socket || !isConnected) return;
    
    // Send message to backend
    socket.emit('chat', {
      message: inputMessage,
      conversationHistory: messages.slice(-10) // Send last 10 messages for context
    });
    
    setInputMessage('');
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  const renderMessageContent = (message) => {
    if (message.data && Array.isArray(message.data)) {
      return (
        <div>
          <p className="mb-2">{message.content}</p>
          <div className="bg-gray-800/50 rounded p-2 text-xs max-h-40 overflow-y-auto">
            <div className="font-mono">
              {message.data.slice(0, 3).map((item, idx) => (
                <div key={idx} className="mb-1 pb-1 border-b border-gray-700 last:border-0">
                  {JSON.stringify(item, null, 2)}
                </div>
              ))}
              {message.data.length > 3 && (
                <div className="text-gray-400 italic">
                  ... and {message.data.length - 3} more results
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    return <p className="whitespace-pre-wrap">{message.content}</p>;
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-110 z-50"
        title="Open AI Assistant"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }
  
  return (
    <div 
      className={`fixed bottom-6 right-6 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 flex flex-col transition-all duration-200 ${
        isMinimized ? 'w-80 h-14' : 'w-96 h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="font-semibold text-white text-sm">AI Assistant</h3>
            <p className="text-xs text-gray-400">
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Disconnected
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title={isMinimized ? "Maximize" : "Minimize"}
          >
            {isMinimized ? (
              <Maximize2 className="w-4 h-4 text-gray-400" />
            ) : (
              <Minimize2 className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
      
      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm mt-8">
                <p>Ask me anything about flights, airports, matches, or scenarios!</p>
                <p className="text-xs mt-2">Try: "Show me airports in California"</p>
              </div>
            )}
            
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.role === 'system'
                      ? 'bg-red-900/30 text-red-200 border border-red-800'
                      : 'bg-gray-800 text-gray-100'
                  }`}
                >
                  {renderMessageContent(message)}
                  <p className="text-xs opacity-60 mt-1">
                    {formatTimestamp(message.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span className="text-sm text-gray-400">AI is thinking...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-gray-700 bg-gray-800/30">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isConnected ? "Ask me anything..." : "Connecting..."}
                disabled={!isConnected}
                className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || !isConnected || isTyping}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 transition-colors"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </>
      )}
    </div>
  );
}
