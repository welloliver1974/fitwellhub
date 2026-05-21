import fs from 'fs';

async function getGroqModels() {
  const envContent = fs.readFileSync('.env', 'utf8');
  const apiKeyMatch = envContent.match(/GROQ_API_KEY=(.*)/);
  if (!apiKeyMatch) {
    console.error("GROQ_API_KEY not found in .env");
    return;
  }
  const apiKey = apiKeyMatch[1].trim();

  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });

  if (!res.ok) {
    console.error("Error fetching models", await res.text());
    return;
  }

  const data = await res.json();
  const visionModels = data.data.filter(m => m.id.toLowerCase().includes('vision'));
  console.log("VISION MODELS AVAILABLE:");
  visionModels.forEach(m => console.log("- " + m.id));
}

getGroqModels();
