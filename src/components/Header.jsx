import { Lock, Settings } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

// Header Component
const Header = ({ time, setTheme, theme, setIsLocked, widgetVisibility, toggleWidgetVisibility }) => {
    const [showWidgetMenu, setShowWidgetMenu] = useState(false);
    const dropdownRef = useRef(null);
    const registeredFaces = JSON.parse(localStorage.getItem('registered_faces') || '[]');

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowWidgetMenu(false);
            }
        };

        if (showWidgetMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showWidgetMenu]);

    const colors = ['cyan', 'yellow', 'mocha'];

    const handleLockClick = () => {

        if (registeredFaces.length === 0) {
            alert('⚠️ No faces registered!\n\nPlease register at least one face in Quick Controls > Face Lock Settings before locking the app.');
            return;
        }

        setIsLocked(true);
    };

    const updateTheme = () => {
        const currentIndex = colors.indexOf(theme);
        const nextIndex = (currentIndex + 1) % colors.length;
        setTheme(colors[nextIndex]);
    }

    const border = `border-${theme}-800`;
    const text_400 = `text-${theme}-400`;
    const text_500 = `text-${theme}-500`;
    const text_700 = `text-${theme}-700`;

    const widgetLabels = {
        weather: 'Weather',
        sports: 'Sports',
        calendar: 'Calendar',
        quickControls: 'Quick Controls',
        spotify: 'Spotify',
        news: 'News',
        smartThings: 'SmartThings',
        govee: 'Govee',
        bluetooth: 'Bluetooth',
        printer: '3D Printer',
        hue: 'Philips Hue',
        tesla: 'Tesla'
    };

    return (
    <div className={`mb-6 flex items-center justify-between border-b ${border} pb-4`}>
        <div className="flex items-center gap-4">
            <div className={`text-4xl font-bold ${text_500}`}>J.O.S.H.</div>
            <div className={`text-sm ${text_700}`}>Joint Operations & Systems Hub v1.0</div>
        </div>
        <div className="text-right flex relative">
            {/* Widget Visibility Dropdown */}
            <div className="relative mr-4" ref={dropdownRef}>
                <button
                    onClick={() => setShowWidgetMenu(!showWidgetMenu)}
                    className={`z-50 rounded py-1 px-4 shadow-lg border ${border} ${text_400} hover:bg-${theme}-600 hover:scale-105 transition-all`}
                    aria-label="Widget Settings"
                >
                    <Settings size={20} className={`inline-block mr-2 text-${theme}-400`} />Widgets
                </button>

                {showWidgetMenu && (
                    <div className={`absolute right-0 mt-2 w-56 bg-black border ${border} rounded shadow-xl z-50`}>
                        <div className={`p-2 border-b ${border} text-${theme}-400 font-semibold text-sm`}>
                            Toggle Widgets
                        </div>
                        <div className="p-2 max-h-96 overflow-y-auto">
                            {Object.entries(widgetLabels).map(([key, label]) => (
                                <label
                                    key={key}
                                    className={`flex items-center p-2 hover:bg-${theme}-900/30 rounded cursor-pointer`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={widgetVisibility[key]}
                                        onChange={() => toggleWidgetVisibility(key)}
                                        className="mr-3 w-4 h-4"
                                    />
                                    <span className={`text-${theme}-300 text-sm`}>{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <button onClick={handleLockClick}
                className={`mr-4 z-50 rounded py-1 px-4 shadow-lg border ${border} rounded ${text_400} hover:bg-${theme}-600 ${registeredFaces.length === 0 ? 'cursor-not-allowed opacity-50' : 'hover:scale-105 transition-all'}`}
                aria-label="Lock UI"
            >
                <Lock size={20} className={`inline-block mr-2 text-${theme}-400`} />Lock
            </button>
            <div className={`items-left pr-4 border-r ${border} mr-4 `}>
                <button className={`p-4 border ${border} rounded text-${theme}-400`} onClick={updateTheme}>Color</button>
            </div>
            <div>
                <div className={`text-2xl font-bold text-${theme}-300`}>
                    {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className={`text-sm text-${theme}-700`}>
                    {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
            </div>
        </div>
    </div>
    )
};

export default Header;