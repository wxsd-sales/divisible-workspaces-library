import xapi from 'xapi';

// Array of codecs, their IP Addresses and serial numbers
const codecs = [
  {
    role: 'Primary',
    ip: '<Codec IP Address>',
    serial: '<Codec Serial>'
  },
  {
    role: 'Secondary',
    ip: '<Codec IP Address>',
    serial: '<Codec Serial>'
  }
];

// Credentails used for inter-codec communcation
const credentials = {
  username: 'divisibleWorkspace',
  password: '<Your Perferred Divisible Workspace Solution Password>'
}


// Customise the combine button and panel text
const combinePanel = {
  button: {
    name: 'Combine Room',
    icon: 'Sliders',
    color: ''
  },
  panel: {
    title: 'Tap the toggle to combine or divide'
  }
};

// Customise the lockPanel text
const lockPanelText = {
  Title: 'Combined Mode',
  Text: 'This codec is in combined mode',
  'Option.1': 'Please use main Touch Panel'
};


export default { codecs, credentials, combinePanel, lockPanelText }
