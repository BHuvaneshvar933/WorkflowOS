import Groq from 'groq-sdk';

export async function executeLlmCall(config: any, context: any) {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'GROQ_API_KEY is not configured in the environment' };
  }

  // Extract prompt from config, optionally replacing variables with context
  const prompt = config.prompt || "Hello, world!";

  const groq = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: model,
    });
    
    return {
      success: true,
      result: chatCompletion.choices[0]?.message?.content || ""
    };
  } catch (error: any) {
    console.error("LLM Call Error:", error);
    return {
      success: false,
      error: error.message || "Unknown error calling Groq"
    };
  }
}
