# J.O.S.H.

Potential Integrations:
- Weather
- Calendar
- Sports
- Ring Cameras
- Govee Devices
- Bluetooth Devices / Speakers
- SmartThings / Frame TV
- Arduino / HackPacks
- Spotify
- Conversational AI
- Stream deck?
- facial recognition lock for the app
- AI news summaries
- Tesla?

Bluetooth Integrations:
- Hardware
    ESP32 or Arduino Nano BLE
    Buttons / rotary encoder

    Flow
    BLE Button Press
    → Browser receives characteristic update
    → Spotify Web API action
    → Play / Pause / Skip

    Example mapping
    BLE Input	Action
    Single press	Play / Pause
    Double press	Next track
    Long press	Previous
    Knob rotate	Volume

- Govee lights change to team colors when team goes live

- device profiles, face lock integration
    - profiles = {
        josh: {
            bluetooth: ["ESP32 Knob", "Desk Lights"],
            spotifyDevice: "Office Speaker",
            theme: "blue"
        }
        }

🔵 4. Persistent Devices (LocalStorage)

Add this easily:

useEffect(() => {
  const saved = JSON.parse(localStorage.getItem("bt_devices") || "[]");
  setDevices(saved);
}, []);

useEffect(() => {
  localStorage.setItem("bt_devices", JSON.stringify(devices));
}, [devices]);


Your Batcomputer remembers its hardware.

Here are all the Sentinel voice commands currently available:           
                                                                          
  Greetings                                                               
                                                                          
  - "Hey Sentinel", "Hello", "Good morning/afternoon/evening"             
                                                                          
  Govee Lights                                                            
  Command: All lights on                                                  
  Examples: "Turn on the lights", "Lights on"                             
  ────────────────────────────────────────                                
  Command: All lights off                                                 
  Examples: "Turn off all the lights", "Kill the lights"                  
  ────────────────────────────────────────                                
  Command: Specific device on/off                                         
  Examples: "Turn on the lamp", "Turn off the projector"                  
  ────────────────────────────────────────                                
  Command: Set color                                                      
  Examples: "Set lights to blue", "Make lights purple"                    
  ────────────────────────────────────────                                
  Command: Set brightness                                                 
  Examples: "Brightness to 50", "Dim to 30%"                              
  Supported devices: Living room lamp, Galaxy (projector), Neon Rope,     
  Ring, LR Left, LR Right                                                 
                                                                          
  Supported colors: Red, green, blue, cyan, purple, yellow, orange, pink, 
  white, warm, cool                                                       
                                                                          
  SmartThings TV (Samsung Frame)                                          
  ┌────────────┬────────────────────────────────────────┐                 
  │  Command   │                Examples                │                 
  ├────────────┼────────────────────────────────────────┤                 
  │ Power      │ "Turn on/off the TV"                   │                 
  ├────────────┼────────────────────────────────────────┤                 
  │ Art mode   │ "Enable art mode", "Turn off art mode" │                 
  ├────────────┼────────────────────────────────────────┤                 
  │ HDMI input │ "Switch to HDMI 2", "HDMI 3"           │                 
  ├────────────┼────────────────────────────────────────┤                 
  │ Mute       │ "Mute the TV"                          │                 
  ├────────────┼────────────────────────────────────────┤                 
  │ Volume     │ "TV volume to 30", "TV volume up"      │                 
  └────────────┴────────────────────────────────────────┘                 
  Spotify                                                                 
  ┌────────────────┬─────────────────────────────────────────┐            
  │    Command     │                Examples                 │            
  ├────────────────┼─────────────────────────────────────────┤            
  │ Play           │ "Play music", "Resume Spotify"          │            
  ├────────────────┼─────────────────────────────────────────┤            
  │ Pause          │ "Pause", "Stop music"                   │            
  ├────────────────┼─────────────────────────────────────────┤            
  │ Skip           │ "Next song", "Skip"                     │            
  ├────────────────┼─────────────────────────────────────────┤            
  │ Previous       │ "Previous track", "Go back"             │            
  ├────────────────┼─────────────────────────────────────────┤            
  │ What's playing │ "What's playing?", "What song is this?" │            
  ├────────────────┼─────────────────────────────────────────┤            
  │ Volume         │ "Volume up", "Set volume to 60"         │            
  └────────────────┴─────────────────────────────────────────┘            
  Information                                                             
  ┌──────────┬─────────────────────────────────────────┐                  
  │ Command  │                Examples                 │                  
  ├──────────┼─────────────────────────────────────────┤                  
  │ Time     │ "What time is it?"                      │                  
  ├──────────┼─────────────────────────────────────────┤                  
  │ Date     │ "What day is it?", "What's the date?"   │                  
  ├──────────┼─────────────────────────────────────────┤                  
  │ Weather  │ "What's the weather?", "Temperature"    │                  
  ├──────────┼─────────────────────────────────────────┤                  
  │ Calendar │ "What's on my calendar?", "Any events?" │                  
  ├──────────┼─────────────────────────────────────────┤                  
  │ Status   │ "Status check", "System status"         │                  
  ├──────────┼─────────────────────────────────────────┤                  
  │ News     │ "What's in the news?", "Top headlines"  │                  
  └──────────┴─────────────────────────────────────────┘                  
  Sports                                                                  
  ┌───────────┬──────────────────────────────────────────┐                
  │  Command  │                 Examples                 │                
  ├───────────┼──────────────────────────────────────────┤                
  │ Scores    │ "How did the Lions do?", "Pistons score" │                
  ├───────────┼──────────────────────────────────────────┤                
  │ Next game │ "When's the next Michigan game?"         │                
  └───────────┴──────────────────────────────────────────┘                
  Supported teams: Lions, Michigan, Pistons, Barcelona     