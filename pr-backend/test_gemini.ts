import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function test() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [
                "What is this?",
                { inlineData: { data: Buffer.from("test").toString('base64'), mimeType: 'text/plain' } }
            ]
        });
        console.log(response.text);
    } catch (e) {
        console.error(e);
    }
}
test();
