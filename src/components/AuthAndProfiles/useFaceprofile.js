import profiles from "./profiles";
import { useProfile } from "./ProfileContext";

export const useFaceProfile = () => {
    const { setProfile } = useProfile();

    const loadProfileFromFace = (faceName) => {
        const profile = profiles[faceName];
        if (!profile) return;
        setProfile(profile);
    };

    return { loadProfileFromFace };
};
