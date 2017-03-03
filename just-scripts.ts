import {WithSubCommand} from './src/definition'

export default {
  oneEcho: {
    command: 'echo hello dear!'
  },
  twoEcho: {
    chain: [
      {command: 'echo hello1'},
      {command: 'bash -c "sleep 1 && echo yo1"'},
      {command: 'bash -c "sleep 1 && echo yo2"'},
    ],
    chainType: 'concurrently'
  },
} as WithSubCommand
