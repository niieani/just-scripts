import {WithSubCommand} from './src/definition'

export default {
  oneEcho: {
    command: 'echo hello dear!'
  },
  twoEcho: {
    chain: [
      {command: 'echo 1'},
      {command: 'bash -c "sleep 1 && echo 2"'},
      {command: 'bash -c "sleep 1 && echo 3"'},
    ],
    chainType: 'concurrent'
  },
  threeEcho: {
    chain: [
      {command: 'echo 1'},
      {command: 'echo 2'},
      {command: 'echo 3'},
    ],
    chainType: 'and'
  },
} as WithSubCommand
