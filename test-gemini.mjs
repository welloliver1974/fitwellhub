import fs from 'fs';

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    return;
  }
  
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gemini-1.5-flash",
      messages: [{ role: "user", content: "Hello" }]
    })
  });
  
  console.log("Status:", res.status);
  console.log(await res.text());
}

testGemini();
