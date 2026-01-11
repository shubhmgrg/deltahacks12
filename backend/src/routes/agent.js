import express from "express";
import { connectDB } from "../datastore.js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_NAME = "google/gemma-3-27b-it:free";

/**
 * Generate content using OpenRouter API
 */
async function generateContent(prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }

  // Trim any whitespace or quotes from the API key
  const apiKey = OPENROUTER_API_KEY.trim().replace(/^["']|["']$/g, '');
  
  console.log('🔑 API Key length:', apiKey.length);
  console.log('🔑 API Key prefix:', apiKey.substring(0, 10) + '...');

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "SkySync AI Agent"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ OpenRouter API Error:', error);
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  
  // Validate response structure
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    console.error('❌ Invalid API response structure:', JSON.stringify(data, null, 2));
    throw new Error(`Invalid API response: ${JSON.stringify(data)}`);
  }
  
  if (!data.choices[0].message || !data.choices[0].message.content) {
    console.error('❌ Missing message content in response:', JSON.stringify(data.choices[0], null, 2));
    throw new Error('Missing message content in API response');
  }
  
  console.log('✅ OpenRouter API response received successfully');
  
  return {
    response: {
      text: () => data.choices[0].message.content
    }
  };
}

// Helper functions to retrieve data from the database

// Load airports from local JSON file
let airportsCache = null;
function loadAirports() {
  if (!airportsCache) {
    try {
      const dataPath = join(__dirname, '../data/airports.json');
      airportsCache = JSON.parse(readFileSync(dataPath, 'utf-8'));
    } catch (error) {
      console.error('Error loading airports.json:', error);
      airportsCache = [];
    }
  }
  return airportsCache;
}

/**
 * Get airports data from the local JSON file
 */
async function getAirportsData(filters = {}) {
  try {
    let airports = loadAirports();
    
    // Apply filters if provided
    if (filters.query) {
      airports = airports.filter(airport => {
        // Simple filtering by checking if any field matches
        for (const [key, value] of Object.entries(filters.query)) {
          if (typeof value === 'string') {
            // Case-insensitive string matching
            const airportValue = airport[key]?.toString().toLowerCase();
            const searchValue = value.toLowerCase();
            if (!airportValue?.includes(searchValue)) {
              return false;
            }
          } else if (airport[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    // Apply limit
    const limit = Math.min(filters.limit || 100, 1000);
    return airports.slice(0, limit);
  } catch (error) {
    console.error("Error fetching airports:", error);
    throw error;
  }
}

/**
 * Get flight formation matches data from the database (formation_edges collection)
 * Schema: { flight1_id, flight2_id, timestamp1, timestamp2, time_diff_seconds, distance_km, feasibility_score }
 */
async function getMatchesData(filters = {}) {
  try {
    console.log('🔍 getMatchesData called with filters:', JSON.stringify(filters, null, 2));
    
    await connectDB();
    const db = await connectDB();
    const collection = db.collection("formation_edges");
    
    const query = filters.query || {};
    const limit = Math.min(filters.limit || 50, 500);
    
    console.log('📊 MongoDB query:', JSON.stringify(query, null, 2));
    console.log('📊 Limit:', limit);
    
    const matches = await collection
      .find(query)
      .limit(limit)
      .toArray();
    
    console.log('✅ getMatchesData returned:', matches.length, 'matches');
    if (matches.length > 0) {
      console.log('📝 Sample match:', JSON.stringify(matches[0], null, 2));
    } else {
      console.log('⚠️ No matches found in database!');
    }
    
    return matches;
  } catch (error) {
    console.error("❌ Error fetching matches:", error);
    throw error;
  }
}

/**
 * Get flight data from the database (flight_nodes collection)
 * Schema: { flight_id, timestamp, location: {type, coordinates}, lat, lon, time_index, carrier, tailnum, origin, dest }
 */
async function getFlightsData(filters = {}) {
  try {
    const db = await connectDB();
    const collection = db.collection('flight_nodes');
    
    console.log('🔍 getFlightsData called with filters:', filters);
    
    const query = {};
    const limit = filters.limit || 10;
    
    // Build query based on filters
    if (filters.carrier) query.carrier = filters.carrier;
    if (filters.origin) query.origin = filters.origin;
    if (filters.dest) query.dest = filters.dest;
    if (filters.flight_id !== undefined) query.flight_id = filters.flight_id;
    
    console.log('📊 MongoDB query:', query, '| Limit:', limit);
    
    // Get distinct flight_ids
    const distinctFlightIds = await collection.distinct('flight_id', query);
    console.log('📊 Found', distinctFlightIds.length, 'unique flight_ids');
    
    // Take only the number we need
    const flightIdsToFetch = distinctFlightIds.slice(0, limit);
    
    // Get one document for each flight_id
    const flights = [];
    for (const flightId of flightIdsToFetch) {
      const flight = await collection.findOne({ 
        ...query, 
        flight_id: flightId 
      }, {
        projection: {
          flight_id: 1,
          lat: 1,
          lon: 1,
          carrier: 1,
          tailnum: 1,
          origin: 1,
          dest: 1,
          _id: 0
        }
      });
      if (flight) flights.push(flight);
    }
    
    console.log('✅ Returned', flights.length, 'unique flights');
    
    return flights;
  } catch (error) {
    console.error('❌ Error in getFlightsData:', error);
    return [];
  }
}

// Define available tools for the AI agent
const availableTools = {
  getAirportsData: {
    description: "Retrieve airports data from local JSON file. Can filter by code, name, city, country, latitude, longitude.",
    parameters: {
      filters: {
        type: "object",
        properties: {
          query: { 
            type: "object", 
            description: "Filter object (e.g., {city: 'New York', country: 'United States'})" 
          },
          limit: { type: "number", description: "Maximum number of results (default 100, max 1000)" }
        }
      }
    },
    handler: getAirportsData
  },
  getMatchesData: {
    description: "Retrieve flight formation edges from the database. Shows which flights might overlap. Returns flight1_id, flight2_id, timestamps, time_diff_seconds, distance_km, and feasibility_score.",
    parameters: {
      filters: {
        type: "object",
        properties: {
          query: { 
            type: "object", 
            description: "MongoDB query filters (e.g., {feasibility_score: {$gt: 0.5}})" 
          },
          limit: { type: "number", description: "Maximum number of results (default 50, max 500)" }
        }
      }
    },
    handler: getMatchesData
  },
  getFlightsData: {
    description: "Retrieve flight data from the database. Returns one random sample per unique flight_id. Fields: flight_id, lat, lon, carrier, tailnum, origin, dest.",
    parameters: {
      filters: {
        type: "object",
        properties: {
          carrier: { type: "string", description: "Filter by airline carrier code (e.g., 'UA', 'AA')" },
          origin: { type: "string", description: "Filter by origin airport code (e.g., 'JFK')" },
          dest: { type: "string", description: "Filter by destination airport code (e.g., 'LAX')" },
          flight_id: { type: "number", description: "Filter by specific flight_id" },
          limit: { type: "number", description: "Maximum number of unique flights to return (default 10)" }
        }
      }
    },
    handler: getFlightsData
  }
};

/**
 * Build context for the AI agent with information about available data
 */
function buildSystemContext() {
  return `You are a helpful AI assistant for a flight formation matching database. You help users query flight data in a natural, conversational way.

You have access to these data sources:
- airports (local JSON): Airport information with code, name, city, country, latitude, longitude
  Example: {code: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States", latitude: 40.6413, longitude: -73.7781}

- flight_nodes (MongoDB): Flight data with one random sample per unique flight_id
  Fields: flight_id, lat, lon, carrier (airline code), tailnum, origin (airport code), dest (airport code)
  Example: {flight_id: 123, lat: 40.69, lon: -74.17, carrier: "UA", tailnum: "N12345", origin: "YOW", dest: "IAH"}

- formation_edges (MongoDB): Potential flight formation matches showing which flights might fly together
  Fields: flight1_id, flight2_id, timestamp1, timestamp2, time_diff_seconds, distance_km, feasibility_score (0-1)
  Example: {flight1_id: 140825, flight2_id: 199934, time_diff_seconds: 960, distance_km: 0, feasibility_score: 0.73}

You can query the database using these functions:
- getAirportsData: Retrieve airports data from local JSON file. Can filter by code, name, city, country, latitude, longitude.
- getMatchesData: Retrieve flight formation edges from the database. Shows which flights might overlap. Returns flight1_id, flight2_id, timestamps, time_diff_seconds, distance_km, and feasibility_score.
- getFlightsData: Retrieve flight position data from the database. Each record shows a flight's position at a specific time. Fields: flight_id, timestamp, lat, lon, carrier, tailnum, origin, dest.

IMPORTANT INSTRUCTIONS:
1. When you need to query data, use this EXACT format:
   useFunction: <functionName>
   parameters: {"query": {...}, "limit": number}
   
   CRITICAL: Do NOT wrap in "filters". Use this format directly:
   ✅ CORRECT: parameters: {"query": {}, "limit": 10}
   ❌ WRONG: parameters: {"filters": {"query": {}, "limit": 10}}
   
2. For MongoDB queries, you can use operators like:
   - Exact match: {"origin": "JFK"}
   - Greater than: {"feasibility_score": {"$gt": 0.5}}
   - Less than: {"distance_km": {"$lt": 100}}
   - Multiple conditions: {"origin": "JFK", "carrier": "UA"}
   - Empty query for all results: {}
   
3. After calling a function, you will receive the data. Use that data to answer the user's question in a natural, conversational way.

4. DO NOT return JSON responses to users. Always respond in natural language.

5. If the query is unclear, ask clarifying questions in a friendly way.

6. When you have data results, summarize them clearly and helpfully.

EXAMPLES:
User: "Show me 10 flights"
You: useFunction: getFlightsData
parameters: {"query": {}, "limit": 10}

User: "Find flights from Newark"
You: useFunction: getFlightsData
parameters: {"query": {"origin": "EWR"}, "limit": 20}

User: "Show United Airlines flights"
You: useFunction: getFlightsData
parameters: {"query": {"carrier": "UA"}, "limit": 15}`;
}

/**
 * POST /api/agent/query
 * Generate a query suggestion using the AI agent
 */
router.post("/query", async (req, res) => {
  try {
    const { question, context } = req.body;
    
    if (!question || typeof question !== "string") {
      return res.status(400).json({ 
        ok: false, 
        error: "question (string) is required" 
      });
    }
    
    // Build the prompt for the AI
    const systemContext = buildSystemContext();
    const userContext = context ? `\n\nAdditional context: ${context}` : "";
    const prompt = `${systemContext}${userContext}\n\nUser question: ${question}`;
    
    // Generate response from OpenRouter
    const result = await generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // Try to parse the response as JSON
    let parsedResponse;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = text.match('/```json\n([\s\S]*?)\n```/') || text.match('/({[\s\S]*})/');
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(text);
      }
    } catch (parseError) {
      // If parsing fails, return the raw text
      parsedResponse = {
        understanding: text,
        rawResponse: true
      };
    }
    
    return res.json({
      ok: true,
      query: parsedResponse,
      rawResponse: text
    });
    
  } catch (error) {
    console.error("Error in agent query:", error);
    return res.status(500).json({
      ok: false,
      error: String(error)
    });
  }
});

/**
 * POST /api/agent/execute
 * Execute a query based on AI agent's suggestion
 */
router.post("/execute", async (req, res) => {
  try {
    const { functionName, parameters } = req.body;
    
    if (!functionName || !availableTools[functionName]) {
      return res.status(400).json({
        ok: false,
        error: `Invalid function name. Available functions: ${Object.keys(availableTools).join(", ")}`
      });
    }
    
    const tool = availableTools[functionName];
    const result = await tool.handler(parameters);
    
    return res.json({
      ok: true,
      data: result,
      count: Array.isArray(result) ? result.length : 1
    });
    
  } catch (error) {
    console.error("Error executing query:", error);
    return res.status(500).json({
      ok: false,
      error: String(error)
    });
  }
});

/**
 * POST /api/agent/ask
 * Ask a question and get both the query suggestion and results
 */
router.post("/ask", async (req, res) => {
  try {
    const { question, context, autoExecute = true } = req.body;
    
    if (!question || typeof question !== "string") {
      return res.status(400).json({
        ok: false,
        error: "question (string) is required"
      });
    }
    
    // Build the prompt for the AI
    const systemContext = buildSystemContext();
    const userContext = context ? `\n\nAdditional context: ${context}` : "";
    const prompt = `${systemContext}${userContext}\n\nUser question: ${question}`;
    
    // Generate response from OpenRouter
    const result = await generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // Try to parse the response as JSON
    let parsedResponse;
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/({[\s\S]*})/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(text);
      }
    } catch (parseError) {
      return res.json({
        ok: true,
        query: { understanding: text, rawResponse: true },
        rawResponse: text,
        data: null,
        message: "Could not parse structured response from AI"
      });
    }
    
    // Execute the query if autoExecute is true and we have a valid function
    let executionResult = null;
    if (autoExecute && parsedResponse.suggestedFunction && availableTools[parsedResponse.suggestedFunction]) {
      const tool = availableTools[parsedResponse.suggestedFunction];
      executionResult = await tool.handler(parsedResponse.parameters);
    }
    
    return res.json({
      ok: true,
      query: parsedResponse,
      rawResponse: text,
      data: executionResult,
      count: executionResult && Array.isArray(executionResult) ? executionResult.length : null
    });
    
  } catch (error) {
    console.error("Error in agent ask:", error);
    return res.status(500).json({
      ok: false,
      error: String(error)
    });
  }
});

/**
 * GET /api/agent/tools
 * List available tools/functions
 */
router.get("/tools", (req, res) => {
  const tools = Object.entries(availableTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parameters: tool.parameters
  }));
  
  return res.json({
    ok: true,
    tools
  });
});

/**
 * Setup Socket.io for real-time AI agent chat
 */
export function setupAgentSocket(io) {
  const agentNamespace = io.of('/agent');
  
  agentNamespace.on('connection', (socket) => {
    console.log('Agent client connected:', socket.id);
    
    // Send welcome message
    socket.emit('message', {
      id: Date.now(),
      role: 'assistant',
      content: 'Hello! I\'m your AI assistant. I can help you query the flight database. Ask me anything about airports, flights, matches, or scenarios!',
      timestamp: new Date().toISOString()
    });
    
    // Handle chat messages
    socket.on('chat', async (data) => {
      const { message, conversationHistory = [] } = data;
      
      try {
        // Echo user message
        socket.emit('message', {
          id: Date.now(),
          role: 'user',
          content: message,
          timestamp: new Date().toISOString()
        });
        
        // Show typing indicator
        socket.emit('typing', true);
        
        const systemContext = buildSystemContext();
        
        // Build conversation context
        const historyContext = conversationHistory.length > 0
          ? '\n\nConversation history:\n' + conversationHistory.map(msg => 
              `${msg.role}: ${msg.content}`
            ).join('\n')
          : '';
        
        const prompt = `${systemContext}${historyContext}\n\nUser: ${message}`;
        
        // Generate response
        const result = await generateContent(prompt);
        const response = result.response;
        let text = response.text();
        
        console.log('\n🤖 ========== GEMINI RESPONSE ==========');
        console.log(text);
        console.log('🤖 ====================================\n');
        
        // Check if the response contains a function call
        let executionResult = null;
        let functionUsed = null;
        
        const functionMatch = text.match(/useFunction:\s*(\w+)/);
        
        if (functionMatch) {
          console.log('🎯 Function detected:', functionMatch[1]);
          const functionName = functionMatch[1];
          let parameters = {};
          
          // Try to extract parameters - handle multiple formats
          const parametersMatch = text.match(/parameters:\s*({[\s\S]*?})(?:\n|$)/);
          
          if (parametersMatch) {
            console.log('📦 Raw parameters match:', parametersMatch[1]);
            try {
              // Clean up the JSON string - remove any trailing text
              let jsonStr = parametersMatch[1];
              
              // Try to find the closing brace if there are multiple
              let braceCount = 0;
              let endPos = 0;
              for (let i = 0; i < jsonStr.length; i++) {
                if (jsonStr[i] === '{') braceCount++;
                if (jsonStr[i] === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    endPos = i + 1;
                    break;
                  }
                }
              }
              
              if (endPos > 0) {
                jsonStr = jsonStr.substring(0, endPos);
              }
              
              console.log('🔧 Cleaned JSON string:', jsonStr);
              parameters = JSON.parse(jsonStr);
              console.log('✅ Parsed parameters:', JSON.stringify(parameters, null, 2));
            } catch (e) {
              console.error('❌ Failed to parse parameters:', e);
              console.error('Raw parameters string:', parametersMatch[1]);
              // Continue with empty parameters
            }
          } else {
            console.log('⚠️ No parameters match found');
          }
          
          // Execute the function if it exists
          if (availableTools[functionName]) {
            console.log('🚀 Executing function:', functionName);
            try {
              executionResult = await availableTools[functionName].handler(parameters);
              functionUsed = functionName;
              
              console.log('📊 Function execution result count:', Array.isArray(executionResult) ? executionResult.length : 1);
              
              // Generate a follow-up response with the data
              const resultCount = Array.isArray(executionResult) ? executionResult.length : 1;
              const fullData = JSON.stringify(executionResult, null, 2);
              
              console.log('📝 Full data for AI (length):', fullData.length, 'characters');
              
              const dataContext = `\n\nThe ${functionName} query returned ${resultCount} result(s). Here is the complete data:\n${fullData}`;
              const followUpPrompt = `${systemContext}${historyContext}\n\nUser: ${message}\n\nYou: ${text}${dataContext}\n\nNow provide a helpful, natural language summary of these results. IMPORTANT: List ALL ${resultCount} results in your response, showing each item's key information (flight_id, carrier, origin, dest, etc.). Format them as a clean numbered or bulleted list. Do not truncate or summarize the list - show every single result.`;
              
              console.log('🔄 Generating follow-up response with data...');
              const followUpResult = await generateContent(followUpPrompt);
              const followUpResponse = followUpResult.response;
              text = followUpResponse.text();
              console.log('💬 Follow-up response:', text);
            } catch (error) {
              console.error('❌ Error executing function:', error);
              console.error('Error stack:', error.stack);
              
              // Provide specific error messages for common issues
              if (error.message.includes('mongodb+srv URI cannot have port number')) {
                text = `I'm having trouble connecting to the database. The MongoDB connection string appears to be misconfigured. Please check your MONGODB_URI environment variable and ensure it doesn't include a port number when using mongodb+srv://`;
              } else if (error.message.includes('MONGODB_URI')) {
                text = `I couldn't connect to the database. Please make sure the MONGODB_URI is properly configured in your environment variables.`;
              } else {
                text = `I tried to fetch that data but encountered an error: ${error.message}. Could you rephrase your question?`;
              }
            }
          } else {
            console.log('⚠️ Function not found in availableTools:', functionName);
            console.log('Available functions:', Object.keys(availableTools));
            text = `I tried to use the function "${functionName}" but it's not available. Available functions are: ${Object.keys(availableTools).join(', ')}`;
          }
        } else {
          console.log('ℹ️ No function call detected in Gemini response');
        }
        
        socket.emit('typing', false);
        
        // Send AI response
        socket.emit('message', {
          id: Date.now() + 1,
          role: 'assistant',
          content: text,
          functionUsed,
          data: executionResult,
          count: executionResult && Array.isArray(executionResult) ? executionResult.length : null,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Error processing chat:', error);
        socket.emit('typing', false);
        socket.emit('error', {
          message: 'Sorry, I encountered an error processing your request.',
          error: String(error)
        });
      }
    });
    
    // Handle tool execution requests
    socket.on('execute', async (data) => {
      const { functionName, parameters } = data;
      
      try {
        if (!availableTools[functionName]) {
          socket.emit('error', {
            message: `Unknown function: ${functionName}`
          });
          return;
        }
        
        const tool = availableTools[functionName];
        const result = await tool.handler(parameters);
        
        socket.emit('execution-result', {
          functionName,
          data: result,
          count: Array.isArray(result) ? result.length : 1,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Error executing function:', error);
        socket.emit('error', {
          message: 'Error executing function',
          error: String(error)
        });
      }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Agent client disconnected:', socket.id);
    });
  });
  
  return agentNamespace;
}

export default router;
