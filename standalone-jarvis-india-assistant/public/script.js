const chat = document.getElementById('chat');
const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-IN';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

async function handleMessage(raw) {
  const text = raw.trim();
  if (!text) return;

  addMessage('user', text);
  input.value = '';

  if (text.toLowerCase().startsWith('quote ')) {
    const symbol = text.slice(6).trim();
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Quote failed');

      const reply = `📈 ${data.shortName || data.symbol}\nSymbol: ${data.symbol}\nPrice: ${data.price} ${data.currency}\nChange: ${data.change} (${data.changePercent}%)\nOpen/High/Low: ${data.open}/${data.high}/${data.low}\nVolume: ${data.volume}\nExchange: ${data.exchange} (${data.marketState})`;
      addMessage('bot', reply);
      speak(reply);
    } catch (e) {
      addMessage('bot', `⚠️ ${e.message}`);
    }
    return;
  }

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    const reply = data.answer || 'No response.';
    addMessage('bot', reply);
    speak(reply);
  } catch (e) {
    addMessage('bot', '⚠️ Could not reach assistant server.');
  }
}

sendBtn.addEventListener('click', () => handleMessage(input.value));
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleMessage(input.value);
});

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = 'Speech recognition not supported in this browser';
} else {
  const rec = new SR();
  rec.lang = 'en-IN';
  rec.interimResults = false;
  rec.continuous = false;

  micBtn.addEventListener('click', () => {
    rec.start();
    micBtn.textContent = '🎙️';
  });

  rec.onresult = e => {
    input.value = e.results[0][0].transcript;
    micBtn.textContent = '🎤';
  };

  rec.onerror = () => {
    micBtn.textContent = '🎤';
  };

  rec.onend = () => {
    micBtn.textContent = '🎤';
  };
}

addMessage(
  'bot',
  'Namaste! I am your independent JARVIS assistant. Ask market concepts, risk rules, tax basics, or use "quote RELIANCE" for stock price snapshot.'
);
