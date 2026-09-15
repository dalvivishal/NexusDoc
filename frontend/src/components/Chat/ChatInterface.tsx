import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, CheckCircle2, Loader2 } from 'lucide-react';
import axios from 'axios';
import classNames from 'classnames';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: string[];
}

interface ChatInterfaceProps {
  onCitationClick: (page: number) => void;
  isDisabled: boolean;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onCitationClick, isDisabled }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I am your domain-specific intelligence assistant. Upload a document to get started.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isDisabled) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await axios.post('http://localhost:8000/api/v1/chat', {
        query: userMessage.content
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.answer,
        steps: response.data.steps,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderContentWithCitations = (content: string) => {
    const citationRegex = /\[Page (\d+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>);
      }
      const pageNum = parseInt(match[1], 10);
      parts.push(
        <button
          key={`cite-${match.index}`}
          onClick={() => onCitationClick(pageNum)}
          className="btn btn-primary"
          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', margin: '0 0.2rem' }}
          title={`View Page ${pageNum}`}
        >
          📄 P{pageNum}
        </button>
      );
      lastIndex = citationRegex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
    }
    return parts;
  };

  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: 'var(--bg-panel)' }}>
      {/* Chat Header */}
      <div className="p-4 flex items-center justify-between z-10" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-2">
          <Bot style={{ color: 'var(--primary-color)' }} size={24} />
          <h2 style={{ fontWeight: 600, fontSize: '1.125rem' }}>AI Document Intelligence</h2>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4" style={{ paddingBottom: '2rem' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={classNames(
              "flex gap-4 animate-fade-in",
              msg.role === 'user' ? "flex-row-reverse" : ""
            )}
            style={{ maxWidth: '85%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
          >
            <div className="flex items-center justify-center flex-shrink-0" style={{
              width: '2rem', height: '2rem', borderRadius: '9999px',
              backgroundColor: msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-hover)'
            }}>
              {msg.role === 'user' ? <User size={16} color="white" /> : <Bot size={16} color="var(--accent-color)" />}
            </div>
            
            <div className="flex flex-col gap-1">
              <div style={{
                padding: '1rem',
                boxShadow: 'var(--shadow-sm)',
                backgroundColor: msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-color)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                borderRadius: msg.role === 'user' ? '1rem 0 1rem 1rem' : '0 1rem 1rem 1rem'
              }}>
                <div style={{ lineHeight: 1.6 }}>
                  {msg.role === 'assistant' ? renderContentWithCitations(msg.content) : msg.content}
                </div>
              </div>

              {/* LangGraph Thought Steps */}
              {msg.steps && msg.steps.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap" style={{ fontSize: '0.75rem', marginLeft: msg.role === 'assistant' ? '0.5rem' : '0' }}>
                  {msg.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1" style={{
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-hover)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--glass-border)'
                    }}>
                      <CheckCircle2 size={12} style={{ color: '#4ade80' }} />
                      <span style={{ textTransform: 'capitalize' }}>{step.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex gap-4 animate-fade-in" style={{ maxWidth: '80%', alignSelf: 'flex-start' }}>
            <div className="flex items-center justify-center flex-shrink-0" style={{
              width: '2rem', height: '2rem', borderRadius: '9999px', backgroundColor: 'var(--bg-hover)'
            }}>
              <Bot size={16} color="var(--accent-color)" />
            </div>
            <div className="flex items-center gap-2" style={{
              padding: '1rem', borderRadius: '0 1rem 1rem 1rem',
              backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)'
            }}>
              <Loader2 size={16} className="animate-pulse" style={{ color: 'var(--text-secondary)' }} />
              <span className="animate-pulse" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Agent is reasoning...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 z-10" style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)' }}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isDisabled || isTyping}
            placeholder={isDisabled ? "Upload a document first..." : "Ask a question about the document..."}
            className="flex-1"
            style={{
              backgroundColor: 'var(--bg-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color var(--transition-fast)'
            }}
          />
          <button
            type="submit"
            disabled={isDisabled || isTyping || !input.trim()}
            className="btn btn-primary"
            style={{
              borderRadius: '0.75rem',
              width: '3rem',
              height: '3rem',
              padding: 0,
              opacity: (isDisabled || isTyping || !input.trim()) ? 0.5 : 1,
              cursor: (isDisabled || isTyping || !input.trim()) ? 'not-allowed' : 'pointer'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
