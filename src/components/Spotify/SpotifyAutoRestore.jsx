import { useEffect } from "react";
import { useProfile } from "../AuthAndProfiles/ProfileContext";
import { transferPlayback, resumePlayback } from "./spotifyApi";

const SpotifyAutoRestore = () => {
    const { profile } = useProfile();

    useEffect(() => {
        if (!profile?.spotify?.accessToken) return;

        const { lastDeviceId, lastPlayback } = profile.spotify;

        const run = async () => {
            try {
                if (lastDeviceId) {
                    await transferPlayback(profile.spotify.accessToken, lastDeviceId);
                }

                if (lastPlayback) {
                    await resumePlayback(
                        profile.spotify.accessToken,
                        lastPlayback.uri,
                        lastPlayback.position
                    );
                }
            } catch (e) {
                console.warn("Spotify restore failed:", e);
            }
        };

        run();
    }, [profile]);

    return null;
};

export default SpotifyAutoRestore;
