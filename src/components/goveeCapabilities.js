// Pure helper (own module so GoveeWidget.jsx only exports components: Vite fast refresh)
// Capabilities come from Govee's own supportCmds for each device (plugs report only
// "turn", the projector has no color, etc.).
// Known quirk, kept on purpose: H6076 lists color/brightness but in practice
// accepted those commands with "Success" and ignored them, so it stays power-only.
// Delete it from API_QUIRKS to try again.
const API_QUIRKS = { H6076: ["turn"] };

export const inferCapabilities = (device) => {
    const model = device.model?.toUpperCase() || "";
    const quirk = Object.keys(API_QUIRKS).find((m) => model.startsWith(m));
    const cmds = new Set(quirk ? API_QUIRKS[quirk] : device.supportCmds || ["turn"]);

    return {
        power: cmds.has("turn"),
        brightness: cmds.has("brightness"),
        color: cmds.has("color"),
        temperature: cmds.has("colorTem"),
        readOnly: Boolean(quirk),
    };
};
