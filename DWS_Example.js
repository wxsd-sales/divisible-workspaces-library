import xapi from 'xapi';
import DWS from './DWS_Lib';
import config from './DWS_Config'

const states = {
  Primary: {
    Divided() {

      // This function defines the Config changes and event handling
      // the primary code should perform while divided

      DWS.Command.StopSendingHeartbeats('Secondary');
      DWS.Command.StopListeningHeartbeats('Secondary');
      
      // Disable Ethernet Mic
      DWS.Command.MuteEthernetMic('tcc2-pri2');

      DWS.Subcriptions.push(xapi.Status.Audio.VolumeMute.on(state => {
        console.log('Primary volume changed')
      }))

      xapi.Config.Audio.Output.HDMI[3].Mode.set('Off');
  
    },
    Combined() {

      // This function defines the Config changes and event handling
      // the primary code should perform while divided
  
      // Start Sending Hearbeats to Secondary Codec every minute
      DWS.Command.StartSendingHeartbeats('Secondary', 1);

      // Listen for Heartbeats from Secondary Codec and require at least one every 10 min
      DWS.Command.StartListeningHeartbeats('Secondary', 'Divided', 10 );

      // Disable Ethernet Mic
      DWS.Command.UnmuteEthernetMic('tcc2-pri2')

      // Notify Secondary codec standby state and voluem changes
      DWS.Subcriptions.push(xapi.Status.Standby.State.on(state => DWS.Command.NotifyCodecs('standby-' + state, ['Secondary']))
      DWS.Subcriptions.push(xapi.Status.Audio.Volume.on(state => DWS.Command.NotifyCodecs('volumeChange-' + state, ['Secondary']))
      DWS.Subcriptions.push(xapi.Status.Audio.VolumeMute.on(state => DWS.Command.NotifyCodecs('volumeMute-' + state, ['Secondary']))
      xapi.Status.Standby.State.get().then(state => DWS.Command.NotifyCodecs('standby-' + state, ['Secondary']))
      xapi.Status.Audio.Volume.get().then(state => DWS.Command.NotifyCodecs('volumeChange-' + state, ['Secondary']))
      xapi.Status.Audio.VolumeMute.get().then(state => DWS.Command.NotifyCodecs('volumeMute-' + state, ['Secondary']))


    }
  },
  Secondary: {
    Divided() {
      DWS.Command.StopHeartBeat();
      DWS.Command.UnlockPanel();
      xapi.Config.Standby.Control.set('On');
      xapi.Config.Standby.Halfwake.Mode.set('Auto');
      xapi.Config.Audio.Ultrasound.MaxVolume.set(70);
      xapi.Command.Conference.DoNotDisturb.Deactivate();

    },
    Combined() {
      // Start Sending Hearbeats to Primary Codec every minute
      DWS.Command.StartSendingHeartbeats('Primary', 1);

      // Listen for Heartbeats from Primary Codec and require at least one every 10 min
      DWS.Command.StartListeningHeartbeats('Primary', 'Divided', 10 );
      
      DWS.Command.LockPanel();
      DWS.Command.ActivateDND();

      xapi.Config.Standby.Control.set('Off');
      xapi.Config.Standby.Halfwake.Mode.set('Auto');
      xapi.Config.Audio.Ultrasound.MaxVolume.set(0);
      
    }
  }
}

init();
async function init(){
  console.log('DWS Example Macro:');
  await DWS.Setup.Config(config);
  await DWS.Setup.States(states);
  console.log('Setup Complete');
  setTimeout(DWS.Command.ApplyState, 2000, 'Combined')
}
