/********************************************************
 * 
 * Macro Author:      	William Mills
 *                    	Technical Solutions Specialist 
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 * 
 * Version: 1-0-0
 * Released: 07/30/24
 * 
 * This example library make it easier to build divisible 
 * workspace configurations for various use cases
 * 
 * Features:
 * 
 * - Collection of methods to simplify the following tasks:
 *    - Locking / Unlocking a controller Touch Panel
 *    - Apply 24hr Do Not Disturb
 *    - Hearbeat solution with state fallback
 *    - Ethernet Audio mute based on stream name
 * 
 * - State Management System:
 *    - Easily switch between states combine/divide or custom states
 * 
 * Full Readme, source code and license details for this macro are available 
 * on Github: https://github.com/wxsd-sales/divisible-workspaces-library
 * 
 ********************************************************/

import xapi from 'xapi';
import { GMM } from './GMM_Lib'

/*********************************************************
 * Configure the settings below
**********************************************************/

const PANEL_LOCATION = 'HomeScreen';
const BASE_PANEL_ID = 'divisibleWorkspaces';


/*********************************************************
 * Main macro functions
**********************************************************/


/* 
  General macro variables
*/
let thisCodecRole;
let thisCodecStates;
let remoteCodecs;
let heartbeatTimer;
let heartbeatTimeOut
let remoteCodecConnection;
let connectionBuffer = {};
let heartbeat;
let lockPanelSubscriptions = [];



/* 
  Instantiate DWS Object, later exported
*/
const DWS = {
  Subscriptions: [],
  Command: {
    LockPanel: {},
    UnlockPanel: {},
    StartHeartbeat: {},
    StopHeartbeat: {},
    MuteEthernetMic: {},
    UnMuteEthernetMic: {},
    ApplyState: {},
    RestartState: {}
  },
  Setup: {},
};


/**
 * Looks and returns specified local user accounts details
 * @param {string} username - Local account username 
 * @returns {object|undefinded}
 * @throws An error for any error where the user does not exist.
 */
async function getUserAccountDetails(username) {
  console.debug(`Getting User Account Details for Username [${username}]`)
  try {
    const result = await xapi.Command.UserManagement.User.Get({ Username: username });
    console.debug('Username lookup results:', result)
    return result
  }
  catch (error) {
    if (error.message === 'User does not exist.') {
      console.debug(`Username [${username}] does not exist`)
      return
    } else {
      throw Error(error.message)
    }
  }
}


/**
 * Looks and returns specified local user accounts details
 * @param {string} username         - Local account username 
 * @param {string} password         - Local account password 
 * @param {string[]} requiredRoles  - Array of required roles eg. ['Integrator', 'User']
 */
async function setupUserAccount(username, password, requiredRoles = ['Integrator', 'User']) {

  requiredRoles = requiredRoles ?? ['Integrator', 'User'];

  if (!username) throw new Error('Unable to setup user: No username given')
  if (!password) throw new Error('Unable to setup user: No password given')

  if (username == '') throw new Error('Unable to setup user: Username cannot\'t be empty an string')
  if (password == '') throw new Error('Unable to setup user: Password cannot\'t be empty an string')

  const account = await getUserAccountDetails(username);

  if (account) {
    // Clean up existing account roles, status and password
    console.debug(`User Account [${username}] exists - checking required roles, password change and active status`);
    const missingRoles = identifyMissingRoles(account, requiredRoles);
    if (missingRoles) {
      console.debug(`User Account [${username}] missing roles `, JSON.stringify(missingRoles), '- adding them to Account');
      await xapi.Command.UserManagement.User.Modify(
        { Active: 'True', AddRole: missingRoles, PassphraseChangeRequired: 'False', Username: username });
    } else if (account.PassphraseChangeRequired == 'True' || account.Active == 'False') {
      console.debug(`User Account [${username}] has no missing roles - Setting Account to Active and no password change required`);
      await xapi.Command.UserManagement.User.Modify(
        { Active: 'True', PassphraseChangeRequired: 'False', Username: username });
    }

    console.debug(`Setting password for User Account [${username}]`);
    await xapi.Command.UserManagement.User.Passphrase.Set({ NewPassphrase: password, Username: username })
      .catch(error => {
        const reason = error?.data?.Result[0]?.Reason;
        if (reason) throw new Error('Unable to setup user: ' + reason)
        throw new Error('Unable to setup user: ' + error.message)
      })

  } else {
    // Create new user account with requred roles, status and password
    console.debug(`User Account [${username}] doesn\'t exist - creating account`);
    await xapi.Command.UserManagement.User.Add({
      Active: 'True',
      Passphrase: password,
      PassphraseChangeRequired: 'False',
      Role: requiredRoles,
      ShellLogin: 'True',
      Username: username
    })
      .catch(error => {
        const reason = error?.data?.Result[0]?.Reason;
        if (reason) throw new Error('Unable to setup user: ' + reason)
        throw new Error('Unable to setup user: ' + error.message)
      })
  }
}


/**
 * Identifies missing required roles for the provided account object
 * @param {object} account - Local account object
 * @param {string[]} requiredRoles  - Array of required roles eg. ['Integrator', 'User']
 * @throws An error if account or requiredRoles are not set.
 */
function identifyMissingRoles(account, requiredRoles) {

  if (!account) throw new Error(`No account details provided`);
  if (!requiredRoles) throw new Error(`No required roles provided`);
  const roles = account?.Roles;
  console.log('roles:',roles)
  if (!roles || roles.length == 0) throw new Error(`User Account [${account.Username}] has no roles to check`)
  if (requiredRoles.length == 0) throw new Error(`Required roles is mssing roles to check`)

  let missing = [];
  for (let i = 0; i < requiredRoles.length; i++) {
    const present = roles.find(role => role.Role == requiredRoles[i]);
    if (!present) missing.push(requiredRoles[i])
  }
  if (missing.length == 0) return
  return missing

}

/** Sends Notification Message to Remote Codec */
async function notifyCodec(message) {
  sendMessage(remoteCodecs, message)
  return
}

function fallback() {
  console.log(`Haven't heard from the other codec in while, falling back to divided mode`)
  applyState('divided');
}


function sendHeartbeat() {
  notifyCodec(BASE_PANEL_ID + '-heartbeat')
}


/**
 * Clears all subscriptions for the provided subscription array
 */
function clearSubscriptions(subArray) {
  for (let i = 0; i < subArray.length; i++) {
    subArray[i]();
    subArray[i] = () => void 0;
  }
  subArray = [];
}



/**
 * Sets the Ethernet connectors channels to either On or Off
 * @param {string} streamName - The Audio Input Ethernet Connectors Stream Name
 * @param {('On'|'Off)} mode - The mode in which to set the Ethernet channels to, either 'On' or 'Off'
 * @returns {number|undefinded}
 */
async function setEthernetMic(streamName, mode) {
  const id = await getEthernetMicNumber(streamName)
  if (!id) return
  console.log('Setting Ethernet Mic - StreamName:', streamName, '- Id:', id, '- Mode:', mode)
  //xapi.Config.Audio.Input.Ethernet[id].Mode.set(mode);
  for (let i = 1; i <= 8; i++) {
    xapi.Config.Audio.Input.Ethernet[id].Channel[i].Mode.set(mode);
  }

}

/**
 * Returns ethernet connector Id for the given stream Name
 * @param {string} streamName - The Audio Input Ethernet Connectors Stream Name
 * @returns {number|undefinded}
 */
async function getEthernetMicNumber(streamName) {
  const ethernetMics = await xapi.Status.Audio.Input.Connectors.Ethernet.get()
    .catch(error => console.log('No Ethernet Audio Inputs Found'))
  if (!ethernetMics) return
  const matchedMic = ethernetMics.find(mic => mic.StreamName.startsWith(streamName))
  if (!matchedMic) return
  return matchedMic.id
}


/**
 * Identifies the role or the current codec
 * @param {array} codecs - Array of Codecs from config
 */
async function identifySelf(codecs) {
  const serial = await xapi.Status.SystemUnit.Hardware.Module.SerialNumber.get()
  return codecs.find(codec => codec.serial == serial)
}


/**
 * Identifies the role or the remote codec
 * @param {array} codecs -  Array of Codecs from config
 */
async function identifyRemoteCodecs(codecs, isPrimary = false) {
  const serial = await xapi.Status.SystemUnit.Hardware.Module.SerialNumber.get()
  if(isPrimary){
    return codecs.filter(codec => codec.serial != serial)
  } else {
    return codecs.find(codec => codec.role.toLowerCase() == 'primary')
  }
}

async function postMessage(codec) {
  const macroName = _main_macro_name();
  const ipAddress = await xapi.Status.Network[1].IPv4.Address.get()

  const gmmFormat = connectionBuffer[codec.ip].messages.map(message => {
    return {
      App: macroName,
      Source: {
        Type: 'Remote_IP',
        Id: '',
        IPv4: ipAddress
      },
      Type: "Status",
      Value: message
    }
  })

  const messages = gmmFormat.map(message => {
    return `<Message><Send><Text>${message}</Text></Send></Message>`
  })
  let Params = {}
  Params.Timeout = 5;
  Params.AllowInsecureHTTPS = 'True'
  Params.Url = `https://${codec.ip}/putxml`
  Params.Header = ['Authorization: Basic ' + btoa(`${codec.username}:${codec.password}`)
    , 'Content-Type: text/xml']

  delete connectionBuffer[codec.ip];
  console.log('Sending:', `<Command>${messages}</Command>`)
  xapi.Command.HttpClient.Post(Params, `<Command>${messages}</Command>`)


}

function sendMessage(codec, message) {
  if (connectionBuffer?.[codec.ip]) {
    console.log('Appending to Array')
    connectionBuffer[codec.ip].messages.push(message)
  } else {
    console.log('Createing new buffer for:', codec.ip)
    connectionBuffer[codec.ip] = {
      username: codec.username,
      password: codec.password,
      messages: [message]
    }
    connectionBuffer[codec.ip].timer = setTimeout(postMessage, 300, codec)
  }

}

DWS.Command.StartHeartbeat = (fallBackState, minInterval) => {
  const state = fallBackState ?? h
  console.log('Starting Combined Heartbeat')
  heartbeat = setInterval(sendHeartbeat, 60 * 1000)
  heartbeatTimer = setTimeout(fallback, heartbeatTimeOut * 60 * 1000)
}

DWS.Command.StopHeartbeat = () => {
  console.log('Stopping Combined Heartbeat')
  if (heartbeat) {
    clearInterval(heartbeat)
    heartbeat = null;
  }

  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer)
    heartbeatTimer = null;
  }
}


/**
 * Process Message Prompt Cleared & Response Events and re-open if required
 */
async function processPanelClose(event, alert) {
  const feedbackId = event?.Cleared?.FeedbackId ?? event?.Response?.FeedbackId;
  if (!feedbackId) return
  if (feedbackId != alert.FeedbackId) return
  const state = await xapi.Status.Standby.State.get()
  if (state == 'Halfwake') return
  xapi.Command.UserInterface.Message.Prompt.Display(alert);
}

DWS.Command.MuteEthernetMic = (streamName) => setEthernetMic(streamName, 'Off')

DWS.Command.UnmuteEthernetMic = (streamName) => setEthernetMic(streamName, 'On')




/**
 * Locks the Controller Panel
 */
DWS.Command.LockPanel = () => {
  console.log('Locking Touch Panel')
  xapi.Config.UserInterface.Features.HideAll.set('True');
  let alert = config.lockPanelText;
  alert.FeedbackId = BASE_PANEL_ID + '-lockPanel';
  xapi.Command.UserInterface.Message.Prompt.Display(alert)
  lockPanelSubscriptions.push(xapi.Event.UserInterface.Message.Prompt.on(event => processPanelClose(event, alert)))
  lockPanelSubscriptions.push(xapi.Status.Standby.State.on(state => {
    if (state != 'Off') return
    xapi.Command.UserInterface.Message.Prompt.Display(alert);
  }))
}


/**
 * Unlock the Controller Panel
 */
DWS.Command.UnlockPanel = () =>  {
  console.log('Unlocking Touch Panel')
  xapi.Config.UserInterface.Features.HideAll.set('False');
  xapi.Command.UserInterface.Message.Prompt.Clear({ FeedbackId: BASE_PANEL_ID + 'lockPanel' });
  clearSubscriptions(lockPanelSubscriptions);
}



/**
 * Apply state for the current device
 */
DWS.Command.ApplyState = async (stateName) => {
  if (!stateName) throw new Error('No state name specified')
  if (!thisCodecStates) throw new Error ('No states defined for this device')
  const newState = thisCodecStates?.[stateName];
  if(!newState) throw new Error (`State [${stateName}] was not found for this device`)
  await saveCombinedState(stateName);
  clearSubscriptions(DWS.Subscriptions);
  console.log('Applying State:', stateName,);
  thisCodecStates[stateName]();
  return
}

/**
 * Returns boolean status if Codec is in a combined state
 * @returns {Promise<boolean>} Returns boolean Promise object representing true if combined and false if not
 */
async function getStoredState() {
  try {
    return await GMM.read.global('SimpleJoinSplit_combinedState');
  } catch (e) {
    console.debug(e)
    await saveCombinedState('divided')
    return 'divided'
  }
}

/**
 * Saves the combined state as a string
 * @param {string} state - The name of the state to save
 */
async function saveCombinedState(state) {
  console.debug('Saving ')
  try {
    await GMM.write.global('SimpleJoinSplit_combinedState', state)
  } catch (e) {
    console.debug(e)
  }
}


/**
 * Saves UI Extension Panel to primary device for combine / divide control
 */
async function savePanel() {
  const panelLocation = PANEL_LOCATION ?? 'Homescreen';
  const panelId = BASE_PANEL_ID ?? 'divisibleWorkspaces';
  const button = config.button;

  let order = '';
  const orderNum = await panelOrder(panelId);
  if (orderNum != -1) order = `<Order>${orderNum}</Order>`;

  const panel = `
  <Extensions>
    <Panel>
      <Location>${panelLocation}</Location>
      <Icon>${button.icon}</Icon>
      ${order}
      <Name>${button.name}</Name>
      <ActivityType>Custom</ActivityType>
      <Page>
        <Name>${button.name}/Name>
        <Row>
          <Widget>
            <WidgetId>${panelId}-combinedivide</WidgetId>
            <Type>GroupButton</Type>
            <Options>size=4;columns=2</Options>
            <ValueSpace>
              <Value>
                <Key>1</Key>
                <Name>Combined</Name>
              </Value>
              <Value>
                <Key>2</Key>
                <Name>Divided</Name>
              </Value>
            </ValueSpace>
          </Widget>
        </Row>
        <Options>hideRowNames=1</Options>
      </Page>
    </Panel>
  </Extensions>`;


  xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel)
    .catch(e => console.log('Error saving panel: ' + e.message))
}


/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({ ActivityType: "Custom" });
  const panels = list?.Extensions?.Panel
  if (!panels) return -1
  const existingPanel = panels.find(panel => panel.PanelId == panelId)
  if (!existingPanel) return -1
  return existingPanel.Order
}


function validate(object, schema) {
  const errors = Object.keys(schema).filter( key => {
    return !schema[key](object[key]);
  });

  if (errors.length > 0) {
    return errors.join(',')
  } 
}

function validateConfig(config){
  if(!config) throw new Error ('No config provided')
  console.log('Validating Config')

  // Validate Codecs, Authentication, Heartbeat

  const codecSchema = {
    role: function (value) {
      return typeof value === 'string'
    },
    ip: function (value) {
      return /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/.test(value)
    },
    serial: function (value) {
      return /^[a-zA-Z0-9]{12}$/.test(value);
    }
  };

  const codecs = config?.codecs;

  for (let i=0; i< codecs.length; i++){
    const codecErrors = validate(codecs[i], codecSchema)
    if(codecErrors) {
      throw new Error('Invalided Codec Config: ' + codecs[i] + ' - Invalid fields: '+ JSON.stringify(codecErrors))
    }
  }
  
  const authenticationSchema = {
    username: function (value) {
      return typeof value === 'string' && value.length > 0
    },
    password: function (value) {
      return typeof value === 'string' && value.length > 0
    }
  };
  
  const authentication = config?.authentication;

  const authErrors = validate(authentication, authenticationSchema)
    if(authErrors) {
      throw new Error('Invalided Authentication Config - Invalid fields: '+ JSON.stringify(authErrors))
    }
  
  const heartbeat = config?.heartbeat;

  const heartbeatSchema = {
    enabled: function (value) {
      return typeof value === 'boolean'
    },
    timeOut: function (value) {
      return typeof value === 'number' && Number.isInteger(value);
    },
    fallbackState: function (value) {
      return typeof value === 'string' && value.length > 0
    }
  }

 const heartbeatErrors = validate(heartbeat, heartbeatSchema)
    if(heartbeatErrors) {
      throw new Error('Invalided Heartbeat Config - Invalid fields: '+ JSON.stringify(authErrors))
    }

  
    // TODO: Validate combinePanel, lockPanelText config
  
}

function validateStates(states){
  if(!states) throw new Error ('No states provided')

  
}

function deactivateMacro(error){
  const macroName = _main_macro_name();
  console.warn(`Deactivating Macro [${macroName}]`)
  xapi.Command.Macros.Macro.Deactivate({ Name: macroName });
  return error 
}


DWS.Setup = async (config, states) => {


  // Validate config and deactivate macro if incorrect
  try{
    validateConfig(config)
  } catch (error){
    throw deactivateMacro(error);
  }

  // Validate states and deactivate macro if incorrect
  try{
    validateStates(states)
  } catch (error){
    throw deactivateMacro(error);
  }
  

  // Identify this device from provided codecs
  const self = await identifySelf(config.codecs);

  // If unable to identify self from config, disable macro
  if (!self) {
    const serial = await xapi.Status.SystemUnit.Hardware.Module.SerialNumber.get()
    throw deactivateMacro(new Error(`Unable to match this Codecs serial [${serial}] with given config - Desactiving macro`));
  }

  heartbeatTimeOut = config.heartbeat.timeOut

  thisCodecRole = self.role;
  console.log('This Codecs Role is: ', thisCodecRole)

  thisCodecStates = states[thisCodecRole]

  // Make GMM Connection to Remote Codec
  const username = config.authentication.username;
  const password = config.authentication.password;
  remoteCodecs = await identifyRemoteCodecs(config.codecs, thisCodecRole.toLowerCase() == 'primary');
  console.log('Remote Codecs:', JSON.stringify(remoteCodecs))
  const remoteCodesIPs = remoteCodecs.map(codec => codec.ip)
  remoteCodecConnection = new GMM.Connect.IP(username, password, remoteCodesIPs)

  
  // Initilize Memory
  console.log('Macro Initializing')
  await GMM.memoryInit()

  GMM.Event.Queue.on(event => {
    if (event.QueueStatus.RemainingRequests != 'Empty') {
      //event.Response.Headers = [] // Clearing Header response for the simplicity of the demo, you may need this info
      console.log(event)
    }
  })

  // Generic listener for events
  xapi.Event.Message.Send.on(async event => {
    console.debug('Message Send Event:', event)
    const data = await filterMessageEvent(event)
    if (!data) return
    const [_panelId, change, value] = data.Value.split('-');
    switch (change) {
      case 'changeState':
        applyState(value);
        break;
      case 'heartbeat':
        if (heartbeatTimer) {
          console.log('Received heartbeat from other today - resetting fallback timer')
          clearTimeout(heartbeatTimer)
          heartbeatTimer = setTimeout(fallback, heartbeatTimeOut * 60 * 1000)
        }
        break;
    }
  })
}

export default DWS;
