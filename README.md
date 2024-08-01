> [!WARNING]  
> This library is still in active development and not fully tested on all devices.

# Divisible Workspaces Library

The Divisible Workspaces (DWS) Macro Library is a suite of tools which provides commands and a state management features for handling common requirements for divisbile workspaces built using Cisco RoomOS Collaboration Devices.


## Overview

This library aims to provide tools specific to divisbile workspaces use cases for Cisco Collaboration RoomOS Devices. Currently the following features are available:

* Touch Panel Lock / Unlock:

    Easily Lock and Unlock the Touch Panel with a single command
    ```javascript
    import DWS from './DWS_Lib';

    // Lock the Touch Panel
    DWS.Command.LockPanel()
    
    // Unlock the Touch Panel
    DWS.Command.UnlockPanel()
    ```
* Toggle Persistent Do Not Disturb:

    Enable or disable a persistant Do Not Disturb state
    ```javascript
    import DWS from './DWS_Lib';

    // Activate Persistent Do Not Disturb
    DWS.Command.ActivateDND()
    
    // Deactivate Persistent Do Not Disturb
    DWS.Command.DeactivateDND()
    ```
    
* Toggle Ethernet Mute Using Stream Name:

    Easily mute and unmute an Ethernet Audio Input using just the stream name. No need to be concerned with streams being associated with different Ethernet Audio Input Connector IDs.
    ```javascript
    import DWS from './DWS_Lib';

    // Mute Ethernet Audio Input with stream name 'myStream'
    DWS.Command.MuteEthernetMic('myStream')
    
    // Unmute Ethernet Audio Input with stream name 'myStream'
    DWS.Command.UnmuteEthernetMic('myStream')
    ```

* Request External Codec Status Check:

    Request a status from other Codecs based on their role name:
     ```javascript
    import DWS from './DWS_Lib';
    import DWS from './DWS_Config';

    example():
     
    async function example(){
         // Setup Divisible Workspace Library with config
         // This contains the Codecs, their Roles and Credentials
         await DWS.Setup(config);
         try{
             // Request a status check from Codec with matching roles 'secondary'
             const secondaryStatus = await DWS.Command.RequestStatus('secondary)
             console.log('Secondary Status:', secondaryStatus);
         } catch (error) {
             // Log Error if could not connect or did not receive response from Codec
             console.error(error)
         }
    }
    ```

    ```mermaid
    sequenceDiagram
    Primary Codec->>+Secondary Codec: Request Status Check
    Secondary Codec->>+Secondary Codec: Check if in call or presenting
    Secondary Codec->>+Primary Codec: Response With Result
    ```

* Send Heartbeats:

    Send periodic heartbeats to specific devices with matching role
     ```javascript
    import DWS from './DWS_Lib';
    import DWS from './DWS_Config';

    example():
     
    async function example(){
         // Setup Divisible Workspace Library with config
         // This contains the Codecs, their Roles and Credentials
         await DWS.Setup(config);
         // Start sending heardbeat signals to the 'secondary' codec every minute
         DWS.Command.StartHearbeat('secondary', 1);
    }
    ```

    ```mermaid
    sequenceDiagram
    Primary Codec->>+Primary Codec: Start Hearbeat to Secondary
    loop Every minute
        Primary Codec->>+Secondary Codec: heartbeat-statename
    end
    ```

* Listen For Heartbeats:

    Listen for periodic heartbeats from specific devices and trigger the switching to a fallback state if no heartbeats have been received after a set amount of time. In this example when set to a ``Combined`` state, both Codecs begin to send heartbeats to eachother and also listen for hearbeats from eachother. If either don't receive a heartbeat for over 10 minutes their they individually fall back to a ``Divided`` state.
    ```javascript
    import DWS from './DWS_Lib';
    import DWS from './DWS_Config';

    const states = {
        Primary: {
            Divided() {
                DWS.Command.StopSendingHeartbeats('Secondary');
                DWS.Command.StopListeningHeartbeats('Secondary');
            },
            Combined() {
                // Listen for heartbeats from 'Secondary' and fallback to 'Divided'
                // if no heartbeats has been received for over 10 minutes
                DWS.Command.ListenForHeartbeats('Secondary', 'Divided', 10);

                // Start Sending Heartbeats to 'Primary'
                DWS.Command.StartSendingHeartbeats('Secondary', 1);
            }
        },
        Secondary: {
            Divided() {
                DWS.Command.StopSendingHeartbeats('Primary');
                DWS.Command.StopListeningHeartbeats('Primary');
            },
            Combined() {
                // Listen for heartbeats from 'Primary' and fallback to 'Divided'
                // if no heartbeats has been received for over 10 minutes
                DWS.Command.ListenForHeartbeats('Primary', 'Divided', 10);

                // Start Sending Heartbeats to 'Primary'
                DWS.Command.StartSendingHearbeats('Primary', 1);
            }
        }
    }
    
    example():
     
    async function example(){
        // Setup Divisible Workspace Library with config
        // This contains the Codecs, their Roles and Credentials
        await DWS.Setup.Config(config);
        // Setup all codec states
        await DWS.Setup.States(states);
        // Set the codec to a combined state
        await DWS.Command.ApplyState('combined');
    }
    ```
* State Management:

  Easily define multiple states for each codec and switch between them with a single command. Additionally, you can define which xAPI Config/Status/Event subscription you wish to monitor only while in that state by adding them to the ``DWS.Subcriptions`` array and when changing between states, the subscriptions are all reset. Making it easy to have the codec react to events in one state and not another.

  ```javascript
    import DWS from './DWS_Lib';
    import DWS from './DWS_Config';

    const states = {
        Primary: {
            Divided() {
                 // While 'Divided' don't monitor the VolumeMute xStatus
            },
            Combined() {
                // While 'Combined' notify the 'Secondary' codec of VolumeMute changes
                DWS.Subcriptions.push(xapi.Status.Audio.VolumeMute.on(state => {
                  DWS.NotifyCodecs(['Secondary'], 'volumeChange-'+state);
                  }))
            }
        },
        Secondary: {
            Divided() {

            },
            Combined() {
                
            }
        }
    }
    
    example():
     
    async function example(){
        // Setup Divisible Workspace Library with config
        // This contains the Codecs, their Roles and Credentials
        await DWS.Setup.Config(config);
        // Setup all codec states
        await DWS.Setup.States(states);
        // Set the codec to a combined state
        await DWS.Command.ApplyState('combined');
    }
    ```

  
## Setup

### Prerequisites & Dependencies: 

- RoomOS/CE 11.8 or above Webex Device
- Web admin access to the device to upload the macro
- Network connectivity between your Webex Devices so they can communicate and sync state changes


### Installation Steps:

1. Download the ``DWS_Lib.js`` and ``DWS_Config.js`` macro files and upload it to your Webex Room devices Macro editor via the web interface.
2. Configure the ``DWS_Config`` macro by specifying the Codecs involved in the divisible workspaces.
3. Don't enable the ``DWS_Lib`` and ``DWS_Config`` macros as these are expected to be imported into you own macro.


### Getting Started:

Refer to the ``DWS_Example``  macro which imports both the ``DWS_Lib`` and ``DWS_Config`` and demonstrates how to use the libraries state management and static methods features:

* State Management:

    ```javascript
    import xapi from 'xapi'
    import DWS from './DWS_Lib'
    import config from './DWS_Config'

    const states = {
        Primary: {
            Divided() {
                // Apply Primary Codec Divided changes here
            },
            Combined() {
                // Apply Primary Codec Combined changes here
            }
        },
        Secondary: {
            Divided() {
                // Apply Secondary Codec Divided changes here
            },
            Combined() {
                // Apply Primary Codec Combined changes here
            }
        }
    }

    init();
    async function init(){
      console.log('Setting up Divisible Workspaces Library with config and states');
      await DWS.Setup(config, states);
      console.log('Setup Complete');
      setTimeout(DWS.Command.ApplyState, 2000, 'Combined')
    }
    ```


* Static Methods:

    ```javascript
    import DWS from './DWS_Lib';

    // Lock the Touch Panel
    DWS.Command.LockPanel()
    
    // Unlock the Touch Panel
    DWS.Command.UnlockPanel()
    ```

## Demo

*For more demos & PoCs like this, check out our [Webex Labs site](https://collabtoolbox.cisco.com/webex-labs).

## License
All contents are licensed under the MIT license. Please see [license](LICENSE) for details.


## Disclaimer

Everything included is for demo and Proof of Concept purposes only. Use of the site is solely at your own risk. This site may contain links to third party content, which we do not warrant, endorse, or assume liability for. These demos are for Cisco Webex use cases, but are not Official Cisco Webex Branded demos.


## Questions
Please contact the WXSD team at [wxsd@external.cisco.com](mailto:wxsd@external.cisco.com?subject=divisible-workspaces-library) for questions. Or, if you're a Cisco internal employee, reach out to us on the Webex App via our bot (globalexpert@webex.bot). In the "Engagement Type" field, choose the "API/SDK Proof of Concept Integration Development" option to make sure you reach our team. 
