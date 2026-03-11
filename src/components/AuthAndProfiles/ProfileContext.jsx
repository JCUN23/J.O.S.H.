import { createContext, useContext, useState } from "react";

const ProfileContext = createContext(null);

/* ---------- Boot helpers ---------- */
const loadInitialProfile = () => {
    const saved = localStorage.getItem("active_profile");
    return saved ? JSON.parse(saved) : null;
};

const loadInitialTheme = (profile) => profile?.theme || "cyan";

export const ProfileProvider = ({ children }) => {
    const initialProfile = loadInitialProfile();

    const [profile, setProfile] = useState(() => initialProfile);
    const [theme, setTheme] = useState(() => loadInitialTheme(initialProfile));

    /* ---------- Apply theme to DOM ---------- */
    // useEffect(() => {
    //     document.documentElement.setAttribute("data-theme", theme);
    // }, [theme]);

    /* ---------- Login ---------- */
    const loginProfile = (profileData) => {
        setProfile(profileData);
        localStorage.setItem("active_profile", JSON.stringify(profileData));
    };

    /* ---------- Update profile ---------- */
    const updateProfile = (updates) => {
        setProfile((prev) => {
            if (!prev) return prev;
            const next = { ...prev, ...updates };
            localStorage.setItem("active_profile", JSON.stringify(next));
            if (updates.theme) setTheme(updates.theme);
            return next;
        });
    };

    const logout = () => {
        setProfile(null);
        setTheme("cyan");
        localStorage.removeItem("active_profile");
    };

    return (
        <ProfileContext.Provider
            value={{
                profile,
                theme,
                loginProfile,
                updateProfile,
                logout,
            }}
        >
            {children}
        </ProfileContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProfile = () => {
    const ctx = useContext(ProfileContext);
    if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
    return ctx;
};
