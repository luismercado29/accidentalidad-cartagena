import React, { useState, useRef, useEffect } from 'react';
import api from '../api';

const SUGERENCIAS = [
  '¿Cuáles son los barrios más peligrosos de Cartagena?',
  '¿A qué hora ocurren más accidentes?',
  '¿Qué tipo de vehículo está más involucrado en accidentes?',
  '¿Cómo puedo reducir el riesgo de accidentes en lluvia?',
  '¿Qué zonas de Cartagena tienen más accidentes fatales?',
  '¿Cuál es la tendencia de accidentes este año?',
];

export default function ChatIA({ usuario, token, toast }) {
  const [mensajes, setMensajes] = useState([
    {
      rol: 'asistente',
      contenido: '¡Hola! Soy el asistente de IA de CrashMap. Puedo ayudarte a analizar datos de accidentalidad en Cartagena y responder preguntas sobre seguridad vial. ¿En qué puedo ayudarte?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput]       = useState('');
  const [cargando, setCargando] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function enviar(texto) {
    const pregunta = (texto || input).trim();
    if (!pregunta) return;
    setInput('');

    setMensajes(prev => [...prev, {
      rol: 'usuario',
      contenido: pregunta,
      timestamp: new Date(),
    }]);

    setCargando(true);

    // Build history in the format the backend expects
    const historialActual = mensajes
      .filter(m => m.rol === 'usuario' || m.rol === 'asistente')
      .map(m => ({
        role: m.rol === 'usuario' ? 'user' : 'assistant',
        content: m.contenido,
      }));

    try {
      const res = await api.post('/api/chat', {
        mensaje: pregunta,
        historial: historialActual.slice(-8), // últimos 8 mensajes
      });
      setMensajes(prev => [...prev, {
        rol: 'asistente',
        contenido: res.respuesta || res.message || 'Sin respuesta del servidor.',
        timestamp: new Date(),
      }]);
    } catch (err) {
      const msg = err.message || '';
      const is404 = msg.includes('404') || msg.toLowerCase().includes('not found');
      const is500 = msg.includes('500') || msg.toLowerCase().includes('internal');
      setMensajes(prev => [...prev, {
        rol: 'asistente',
        contenido: is404
          ? 'El backend necesita ser reiniciado con la versión actualizada. Cierra y vuelve a abrir iniciar_backend.bat.'
          : is500
          ? 'Error interno del backend. Revisa los logs del servidor.'
          : `Error al conectar: ${msg}`,
        timestamp: new Date(),
        error: true,
      }]);
    } finally {
      setCargando(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  function formatTime(date) {
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', minHeight: '500px' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        borderRadius: '12px 12px 0 0',
        padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem',
        }}>🤖</div>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>Asistente IA — CrashMap</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>Análisis de accidentalidad en Cartagena</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem' }}>En línea</span>
        </div>
      </div>

      {/* Sugerencias */}
      {mensajes.length <= 1 && (
        <div style={{
          background: '#f8fafc',
          borderLeft: '1px solid #e2e8f0',
          borderRight: '1px solid #e2e8f0',
          padding: '1rem 1.5rem',
        }}>
          <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: '0.7rem', fontWeight: 600 }}>
            Sugerencias de preguntas:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {SUGERENCIAS.map((s, i) => (
              <button
                key={i}
                onClick={() => enviar(s)}
                style={{
                  background: 'white',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '20px',
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.78rem',
                  color: '#4f46e5',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.target.style.background = '#eef2ff'; e.target.style.borderColor = '#4f46e5'; }}
                onMouseLeave={e => { e.target.style.background = 'white'; e.target.style.borderColor = '#e2e8f0'; }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem',
        background: '#f9fafb',
        border: '1px solid #e2e8f0',
        borderTop: mensajes.length <= 1 ? 'none' : '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>
        {mensajes.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.rol === 'usuario' ? 'flex-end' : 'flex-start',
              gap: '0.6rem',
              alignItems: 'flex-end',
            }}
          >
            {msg.rol === 'asistente' && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: msg.error ? '#fee2e2' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
              }}>
                {msg.error ? '⚠️' : '🤖'}
              </div>
            )}
            <div style={{ maxWidth: '72%' }}>
              <div style={{
                background: msg.rol === 'usuario'
                  ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                  : msg.error ? '#fee2e2' : 'white',
                color: msg.rol === 'usuario' ? 'white' : msg.error ? '#dc2626' : '#1f2937',
                padding: '0.75rem 1rem',
                borderRadius: msg.rol === 'usuario' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: '0.88rem',
                lineHeight: 1.6,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                border: msg.error ? '1px solid #fca5a5' : 'none',
              }}>
                {msg.contenido}
              </div>
              <div style={{
                fontSize: '0.72rem', color: '#9ca3af',
                marginTop: '0.25rem',
                textAlign: msg.rol === 'usuario' ? 'right' : 'left',
              }}>
                {formatTime(msg.timestamp)}
              </div>
            </div>
            {msg.rol === 'usuario' && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: '#e0e7ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.9rem', fontWeight: 700, color: '#4f46e5',
              }}>
                {(usuario?.username || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
        ))}

        {cargando && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>🤖</div>
            <div style={{
              background: 'white',
              borderRadius: '16px 16px 16px 4px',
              padding: '0.75rem 1rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              display: 'flex', gap: '4px', alignItems: 'center',
            }}>
              {[0, 1, 2].map(n => (
                <div key={n} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#94a3b8',
                  animation: `bounce 1.2s ${n * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        padding: '1rem 1.5rem',
        display: 'flex', gap: '0.75rem', alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Escribe una pregunta sobre accidentalidad en Cartagena… (Enter para enviar)"
          disabled={cargando}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1.5px solid #e2e8f0',
            borderRadius: '10px',
            padding: '0.65rem 1rem',
            fontSize: '0.88rem',
            fontFamily: 'inherit',
            outline: 'none',
            lineHeight: 1.5,
            maxHeight: '120px',
            overflowY: 'auto',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = '#4f46e5'; }}
          onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
        />
        <button
          onClick={() => enviar()}
          disabled={cargando || !input.trim()}
          style={{
            background: cargando || !input.trim()
              ? '#e2e8f0'
              : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            color: cargando || !input.trim() ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '0.65rem 1.2rem',
            fontSize: '0.9rem',
            cursor: cargando || !input.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {cargando ? '...' : '➤ Enviar'}
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
