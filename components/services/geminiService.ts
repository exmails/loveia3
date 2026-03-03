import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export interface ChatMessage {
    role: "user" | "model";
    content: string;
}

export interface ChatConfig {
    apiKey?: string;
    model: string;
    systemInstruction?: string;
}

export class GeminiService {
    private ai: GoogleGenAI;
    private model: string;

    constructor(config: ChatConfig) {
        const apiKey = config.apiKey;
        this.ai = new GoogleGenAI({ apiKey });
        this.model = config.model;
    }

    async sendMessage(message: string, history: ChatMessage[], systemInstruction?: string) {
        const chat = this.ai.chats.create({
            model: this.model,
            config: {
                systemInstruction: systemInstruction || "You are a helpful and professional AI assistant.",
            },
            history: history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }))
        });

        const response: GenerateContentResponse = await chat.sendMessage({ message });
        return response.text;
    }

    async *sendMessageStream(message: string, history: ChatMessage[], systemInstruction?: string) {
        const chat = this.ai.chats.create({
            model: this.model,
            config: {
                systemInstruction: systemInstruction || "You are a helpful and professional AI assistant.",
            },
            history: history.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }))
        });

        const streamResponse = await chat.sendMessageStream({ message });
        for await (const chunk of streamResponse) {
            const c = chunk as GenerateContentResponse;
            yield c.text;
        }
    }
}
