import { Printer, ExternalLink, Cloud } from 'lucide-react';

const CrealityPrinterWidget = ({ theme }) => {
    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;

    return (
        <div className={`${bgClass} border ${borderClass} rounded-lg p-6 flex flex-col`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Printer className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>ENDER 3 V2</h3>
                </div>
                <div className="flex items-center gap-2">
                    <Cloud size={14} className="text-green-400" />
                    <div className="text-xs font-mono text-green-400">Nebula</div>
                </div>
            </div>

            <div className={`bg-black/50 border ${borderClass} rounded p-4 mb-4`}>
                <div className={`text-sm text-${theme}-300 mb-2`}>
                    Printer Status
                </div>
                <div className={`text-xs text-${theme}-600`}>
                    Creality Nebula uses proprietary cloud API. Monitor your printer through:
                </div>
            </div>

            <div className="space-y-2">
                <a
                    href="https://www.crealitycloud.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between bg-black/50 border ${borderClass} rounded p-3 hover:border-${theme}-600 transition-all group`}
                >
                    <div>
                        <div className={`text-sm font-semibold text-${theme}-300`}>
                            Creality Cloud Web
                        </div>
                        <div className={`text-xs text-${theme}-700`}>
                            Monitor & control online
                        </div>
                    </div>
                    <ExternalLink size={16} className={`text-${theme}-600 group-hover:text-${theme}-400`} />
                </a>

                <a
                    href="https://apps.apple.com/app/creality-cloud/id1484566896"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between bg-black/50 border ${borderClass} rounded p-3 hover:border-${theme}-600 transition-all group`}
                >
                    <div>
                        <div className={`text-sm font-semibold text-${theme}-300`}>
                            Mobile App
                        </div>
                        <div className={`text-xs text-${theme}-700`}>
                            iOS & Android
                        </div>
                    </div>
                    <ExternalLink size={16} className={`text-${theme}-600 group-hover:text-${theme}-400`} />
                </a>
            </div>

            <div className={`mt-4 text-xs text-${theme}-700 text-center`}>
                <div className="mb-2">Alternative: Install OctoPrint</div>
                <a
                    href="https://octoprint.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-${theme}-500 hover:text-${theme}-400 underline`}
                >
                    octoprint.org →
                </a>
            </div>
        </div>
    );
};

export default CrealityPrinterWidget;