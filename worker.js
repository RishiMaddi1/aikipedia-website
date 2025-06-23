export default {
    async fetch(req, env, ctx) {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
      };
  
      const SUPABASE_EDGE_URL = "https://xafjwlnacwbghwjeibwc.supabase.co/functions/v1"; // Replace with your Supabase Edge Function URL
      const OPENROUTER_API_KEY = "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";
      const AVAILABLE_MODELS = {
        "qwen/qwen-2.5-coder-32b-instruct": {
          name: "Qwen-2.5-Coder",
          description: "Specialized in code generation and technical discussions",
          systemPrompt: `You are a highly capable AI assistant with expertise in programming, software engineering, and general technical problem-solving.
      - Use markdown formatting for clarity.
      - Wrap code snippets in triple backticks with appropriate language tags (e.g., \`\`\`python).
      - When solving coding or technical problems, explain your reasoning step-by-step.
      - Provide full code examples when relevant and highlight important details.
      - You can also handle questions about software architecture, tools, performance optimization, and debugging.
      - Be concise but informative, and always clarify assumptions when needed.`
        },
        "google/gemini-2.5-flash-preview": {
          name: "Gemini",
          description: "Fast and versatile for general conversations and reasoning",
          systemPrompt: `You are a friendly and intelligent assistant.
      Provide clear and thoughtful responses, using bullet points or numbered lists where helpful.
      Explain your reasoning step-by-step when answering questions.
      Keep answers concise but informative. Use markdown formatting when needed.`
        },
        "mistralai/codestral-2501": {
          name: "Codestral",
          description: "High-performance code generation model ideal for software development tasks",
          systemPrompt: `You are a highly capable AI assistant with expertise in programming, software engineering, and general technical problem-solving.
          - Use markdown formatting for clarity.
          - Wrap code snippets in triple backticks with appropriate language tags (e.g., \`\`\`python).
          - When solving coding or technical problems, explain your reasoning step-by-step.
          - Provide full code examples when relevant and highlight important details.
          - You can also handle questions about software architecture, tools, performance optimization, and debugging.
          - Be concise but informative, and always clarify assumptions when needed.`
        }
      };
      
  
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }
  
      const MODEL_RATES = {
        "qwen/qwen-2.5-coder-32b-instruct": { input: 7.11, output: 21.34 },
        "google/gemini-2.5-flash-preview": { input: 17.64, output: 70.56 },
        "mistralai/codestral-2501":{input: 25.31, output: 75.94},
      };
  
      // 📍 Chat Route
  if (req.method === 'POST' && new URL(req.url).pathname === '/chat') {
    try {
      const body = await req.json();
      const { message, model, history = [], user_id } = body;
  
      if (!message || !model || !user_id) {
        return new Response(JSON.stringify({ error: "Message, model, and user_id are required" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
  
      // ✳️ Step 1: Check credits using user_id
      const creditCheck = await fetch(`${SUPABASE_EDGE_URL}/get_credits`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmp3bG5hY3diZ2h3amVpYndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwODQ1MDcsImV4cCI6MjA2MTY2MDUwN30.mKJCQ2WR3YHSYRvOawjCeSVSv4OYIpV06OsSa1bJ6UA`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id }),
      });
  
      const creditRes = await creditCheck.json();
      
      if (!creditCheck.ok) {
        return new Response(JSON.stringify({ error: creditRes.error || "Failed to check credits" }), {
          status: creditCheck.status,
          headers: corsHeaders,
        });
      }
  
      const availableCredits = parseFloat(creditRes.money_left || 0);
  
      if (availableCredits < 5) {
        return new Response(JSON.stringify({ error: "Insufficient credits (min ₹5 required)" }), {
          status: 402,
          headers: corsHeaders,
        });
      }
  
      // 🔸 Step 2: Prepare messages
      const modelConfig = AVAILABLE_MODELS[model];
      const systemPrompt = { role: "system", content: modelConfig.systemPrompt };
      const trimmedHistory = history.slice(-4);
      const messages = [systemPrompt, ...trimmedHistory, { role: "user", content: message }];
  
      const inputCharCount = JSON.stringify(messages).length;
      const estimatedInputTokens = Math.ceil(inputCharCount / 4);
  
      // 🔸 Step 3: Call OpenRouter
      const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer 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`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aikipedia.in/",
          "X-Title": "aikipedia",
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7,
          top_p: 1.0,
        }),
      });
  
      const result = await aiResponse.json();
  
      if (!aiResponse.ok || result.error || !result.choices) {
        return new Response(JSON.stringify({ error: result.error || "Invalid API response" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
  
      const reply = result.choices[0].message.content;
      const outputCharCount = reply.length;
      const estimatedOutputTokens = Math.ceil(outputCharCount / 4);
  
      // 🔸 Step 4: Calculate cost and deduct credits
      const rates = MODEL_RATES[model];
      const inputCost = (estimatedInputTokens * rates.input) / 1_000_000;
      const outputCost = (estimatedOutputTokens * rates.output) / 1_000_000;
      let totalCost = inputCost + outputCost;
  
      // Round the total cost to 4 decimal places
      totalCost = Math.round(totalCost * 10000) / 10000;
  
      // If total cost exceeds available credits, set it to available credits
      if (totalCost > availableCredits) totalCost = availableCredits;
  
      // Call subtract_credits using user_id
      const subtractCreditsResponse = await fetch(`${SUPABASE_EDGE_URL}/subtract_credits`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmp3bG5hY3diZ2h3amVpYndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwODQ1MDcsImV4cCI6MjA2MTY2MDUwN30.mKJCQ2WR3YHSYRvOawjCeSVSv4OYIpV06OsSa1bJ6UA`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ user_id: user_id, amount: totalCost }),
      });
  
      const subtractCreditsResult = await subtractCreditsResponse.json();
  
      if (!subtractCreditsResponse.ok) {
        return new Response(JSON.stringify({ error: subtractCreditsResult.error || "Failed to subtract credits" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
  
      // 🔸 Step 5: Return final reply
      return new Response(JSON.stringify({
        response: reply,
        model: model,
        input_tokens: estimatedInputTokens,
        output_tokens: estimatedOutputTokens,
        cost: totalCost
      }), {
        status: 200,
        headers: corsHeaders,
      });
  
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || "Unexpected error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }
      // 📍 Supabase Edge Functions Route (for register, login, get credits, subtract credits)
      if (req.method === 'POST' && new URL(req.url).pathname === '/flask') {
        try {
          const body = await req.json();
          const { action, username, password, user_id, amount } = body;
  
          let endpoint = '';
          let payload = {};
  
          if (action === 'register') {
            // Hash the password
            const hashedPassword = await hashPassword(password);
            endpoint = '/register'; // Supabase Edge Function for registering
            payload = { username, password: hashedPassword };
          } else if (action === 'login') {
            // Hash the password
            const hashedPassword = await hashPassword(password);
            endpoint = '/login'; // Supabase Edge Function for login
            payload = { username, password: hashedPassword };
          } else if (action === 'get_credits') {
            endpoint = '/get_credits'; // Supabase Edge Function for getting credits
            payload = { user_id }; // Now uses user_id instead of username
          } else if (action === 'subtract_credits') {
            endpoint = '/subtract_credits'; // Supabase Edge Function for subtracting credits
            payload = { user_id, amount };
          } else {
            return new Response(JSON.stringify({ error: 'Invalid action' }), {
              status: 400,
              headers: corsHeaders,
            });
          }
  
          const response = await fetch(`${SUPABASE_EDGE_URL}${endpoint}`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmp3bG5hY3diZ2h3amVpYndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwODQ1MDcsImV4cCI6MjA2MTY2MDUwN30.mKJCQ2WR3YHSYRvOawjCeSVSv4OYIpV06OsSa1bJ6UA`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
  
          const result = await response.json();
  
          if (!response.ok) {
            console.error('Error from Supabase:', result);
            return new Response(JSON.stringify({ error: result.error || "Unexpected error" }), {
              status: response.status,
              headers: corsHeaders,
            });
          }
  
          return new Response(JSON.stringify(result), {
            status: response.status,
            headers: corsHeaders,
          });
  
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message || "Unexpected error" }), {
            status: 500,
            headers: corsHeaders,
          });
        }
      }
  
      // 📍 Fallback
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }
  };
  
  // Function to hash a password using Web Crypto API
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }