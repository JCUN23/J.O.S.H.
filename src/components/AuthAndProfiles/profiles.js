export const profiles =
{
    "Josh": {
        id: "josh",
        name: "Josh",
        theme: "cyan",

        spotify: {
            accessToken: "...",
            refreshToken: "...",
            lastDeviceId: "...",
            lastPlayback: {
                uri: "...",
                position: 12345
            }
        },

        bluetooth: {
            knownDevices: [
                { id: "AA:BB:CC", name: "Office Speaker" }
            ],
            autoConnect: true
        }
    }
}
