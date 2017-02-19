import * as commandStringToArgv from 'string-argv'
import {takeWhile} from 'ramda'

export function getCommandFromString(command : string) {
  // TODO: add parsing &&, || and ;
  const commandBits = command.split(' ')
  const envAsStrings = takeWhile(part => part.indexOf('=') > 0, commandBits)
  const env = envAsStrings.reduce((obj, envAsString) => {
    const [variable, value] = envAsString.split('=')
    return Object.assign(obj, {[variable]: value})
  }, {})
  const executable = commandBits[envAsStrings.length]
  const argvString = commandBits.slice(envAsStrings.length + 1).join(' ')
  const args = commandStringToArgv(argvString)
  return {
    args,
    executable,
    env,
  }
}

