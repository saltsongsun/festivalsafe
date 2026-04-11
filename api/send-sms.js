import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능' });

  try {
    const { apiKey, apiSecret, sender, messages } = req.body;

    if (!apiKey || !apiSecret || !sender || !messages?.length) {
      return res.status(400).json({ error: '필수 값 누락', detail: 'apiKey, apiSecret, sender, messages 필요' });
    }

    // ★ HMAC-SHA256 서명 생성 (Solapi 공식 인증 방식)
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(32).toString('hex');
    const signature = crypto.createHmac('sha256', apiSecret)
      .update(date + salt)
      .digest('hex');

    const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

    // Solapi API 호출 (서버→서버, CORS 문제 없음)
    const response = await fetch('https://api.solapi.com/messages/v4/send-many', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();

    return res.status(response.ok ? 200 : 400).json({
      success: response.ok,
      status: response.status,
      data,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
