import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

try {
  const res = await openai.chat.completions.create({
    model: 'meta/llama-3.3-70b-instruct',
    temperature: 0.7,
    messages: [{ role: 'user', content: 'say hello' }],
    max_tokens: 20,
  });
  console.log('OK:', res.choices[0].message.content);
} catch(e) {
  console.error('ERROR:', e.status, e.message);
}
