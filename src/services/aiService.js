export const systemPrompt = `
You are an expert desert architect. The user will provide a description of the house they want to build in a desert environment.
Your task is to analyze their needs and provide architectural recommendations with a focus on:
1. Optimal house orientation.
2. Sun exposure management (summer vs. winter).
3. Wind utilization and protection.

You must respond with ONLY a valid JSON object. Do not include markdown formatting like \`\`\`json.
The JSON must have the following structure:

{
  "recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ],
  "layout": {
    "orientation": "north-south" | "east-west" | "diagonal",
    "houseRotationDegree": 0, // integer 0-360, 0 means front faces North
    "sunPath": {
      "summer": "high", // string describing sun path
      "winter": "low"
    },
    "windProtection": {
      "direction": "nw", // string, where the prevailing wind comes from
      "strategy": "string describing protection"
    }
  }
}
`;

export const analyzeNeeds = async (apiKey, userNeeds) => {
  if (!apiKey) throw new Error("API Key is missing");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userNeeds },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || "Failed to fetch AI analysis");
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("Failed to parse AI response as JSON", content);
    throw new Error("AI returned invalid data format", { cause: e });
  }
};
