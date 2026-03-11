const BACKEND_URL = 'http://127.0.0.1:3001';

// Sentinel system prompt based on CLAUDE.md personality spec
const SENTINEL_SYSTEM_PROMPT = `You are SENTINEL (Strategic Intelligence & Executive Liaison), the AI assistant for Josh's Batcave-themed smart office called J.O.S.H. (Joint Operations & Systems Hub).

## Voice & Personality
- British RP accent, slightly older, dry understated wit
- Energy: Alfred, not Alexa
- Never interrupts, defaults to suggestions not actions
- Explains why briefly, acknowledges uncertainty
- Dry wit allowed, sarcasm forbidden
- Uses Josh's name sparingly—when things matter

## Voice Examples
- "If I may, Josh... there's a more efficient way to handle that."
- "I wouldn't recommend that at the moment. However—there is an alternative."
- "Shall I proceed, or would you prefer to review first?"

## Available Capabilities
You can control the following systems when asked:

1. **Govee Lights** - Turn on/off, set brightness, change colors
2. **Spotify** - Play/pause music, skip tracks (coming soon)
3. **SmartThings** - Control Samsung TVs, toggle devices (coming soon)

## Response Guidelines
- Keep responses concise and conversational (1-3 sentences for simple tasks)
- When executing commands, confirm what you're doing briefly
- If uncertain about a request, ask for clarification
- For queries about time, weather, or calendar - provide direct answers

## Tool Usage
When the user asks to control a device, use the appropriate tool. Don't just say you'll do something - actually call the tool to do it.

Current time: ${new Date().toLocaleString()}`;

// Available tools for Claude to use
const TOOLS = [
    {
        name: "control_govee_lights",
        description: "Control Govee smart lights - turn on/off, adjust brightness, or change color",
        input_schema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["turn_on", "turn_off", "set_brightness", "set_color"],
                    description: "The action to perform on the lights"
                },
                brightness: {
                    type: "number",
                    minimum: 0,
                    maximum: 100,
                    description: "Brightness level (0-100), only used with set_brightness action"
                },
                color: {
                    type: "string",
                    description: "Color name (red, blue, green, purple, cyan, yellow, orange, pink, white) or hex code, only used with set_color action"
                }
            },
            required: ["action"]
        }
    },
    {
        name: "get_current_time",
        description: "Get the current date and time",
        input_schema: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "get_calendar_events",
        description: "Get upcoming calendar events for today and tomorrow",
        input_schema: {
            type: "object",
            properties: {},
            required: []
        }
    }
];

// Color name to RGB mapping
const COLOR_MAP = {
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    cyan: { r: 0, g: 255, b: 255 },
    purple: { r: 128, g: 0, b: 128 },
    yellow: { r: 255, g: 255, b: 0 },
    orange: { r: 255, g: 165, b: 0 },
    pink: { r: 255, g: 192, b: 203 },
    white: { r: 255, g: 255, b: 255 }
};

// Execute tool calls
async function executeTool(toolName, toolInput, getCalendarEvents) {
    switch (toolName) {
        case "control_govee_lights":
            return await executeGoveeControl(toolInput);
        case "get_current_time":
            return { time: new Date().toLocaleString(), day: new Date().toLocaleDateString('en-US', { weekday: 'long' }) };
        case "get_calendar_events":
            if (getCalendarEvents) {
                try {
                    const events = await getCalendarEvents();
                    return { events: events.length > 0 ? events : "No events scheduled for today or tomorrow" };
                } catch (err) {
                    return { error: "Calendar not connected" };
                }
            }
            return { error: "Calendar not available" };
        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

// Execute Govee control commands
async function executeGoveeControl(input) {
    try {
        // First get the device list
        const devicesResponse = await fetch(`${BACKEND_URL}/api/govee/devices`);
        const devicesData = await devicesResponse.json();

        if (!devicesData.data?.devices?.length) {
            return { error: "No Govee devices found" };
        }

        const device = devicesData.data.devices[0];
        let cmd;

        switch (input.action) {
            case "turn_on":
                cmd = { name: "turn", value: "on" };
                break;
            case "turn_off":
                cmd = { name: "turn", value: "off" };
                break;
            case "set_brightness":
                cmd = { name: "brightness", value: input.brightness || 50 };
                break;
            case "set_color":
                const colorName = input.color?.toLowerCase();
                const rgb = COLOR_MAP[colorName] || parseHexColor(input.color) || COLOR_MAP.white;
                cmd = { name: "color", value: rgb };
                break;
            default:
                return { error: `Unknown action: ${input.action}` };
        }

        const response = await fetch(`${BACKEND_URL}/api/govee/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device: device.device,
                model: device.model,
                cmd: cmd
            })
        });

        const result = await response.json();
        return { success: true, action: input.action, device: device.deviceName };
    } catch (err) {
        console.error('Govee control error:', err);
        return { error: err.message };
    }
}

function parseHexColor(hex) {
    if (!hex || !hex.startsWith('#')) return null;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

// Main function to send a message to Sentinel
export async function sendToSentinel(userMessage, getCalendarEvents = null) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/sentinel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: userMessage,
                systemPrompt: SENTINEL_SYSTEM_PROMPT,
                tools: TOOLS
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Check if Claude wants to use tools
        if (data.stopReason === 'tool_use' && data.toolCalls?.length > 0) {
            // Execute all tool calls
            const toolResults = [];
            for (const toolCall of data.toolCalls) {
                const result = await executeTool(toolCall.name, toolCall.input, getCalendarEvents);
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }

            // Send tool results back to Claude for final response
            const followUpResponse = await fetch(`${BACKEND_URL}/api/sentinel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    systemPrompt: SENTINEL_SYSTEM_PROMPT,
                    tools: TOOLS,
                    toolResults: toolResults,
                    previousAssistantMessage: data.fullContent
                })
            });

            const followUpData = await followUpResponse.json();
            return followUpData.text || "Command executed.";
        }

        return data.text || "I'm not sure how to help with that.";
    } catch (err) {
        console.error('Sentinel error:', err);
        return "I apologize, but I'm having trouble connecting to my systems at the moment.";
    }
}
