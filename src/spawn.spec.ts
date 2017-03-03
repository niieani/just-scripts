import './spawn'

const testTasks = [
  {id : '1', command : 'bash', args: ['-c', 'echo START1 && sleep 3 && echo END1']},
  {id : '2', command : 'bash', args: ['-c', 'echo START2 && sleep 1 && echo END2']}
]

describe('spawn', () => {
  test('run a command', () => {

  })
})
