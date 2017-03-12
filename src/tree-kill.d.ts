declare module 'tree-kill' {
  type Signal = 'SIGHUP' | 'SIGINT' | 'SIGQUIT' | 'SIGILL' | 'SIGABRT' | 'SIGFPE' | 'SIGKILL' | 'SIGSEGV' | 'SIGPIPE' | 'SIGALRM' | 'SIGTERM' | 'SIGUSR1' | 'SIGUSR2' | 'SIGCHLD' | 'SIGCONT' | 'SIGSTOP' | 'SIGTSTP' | 'SIGTTIN' | 'SIGTTOU'

  /**
   * Kill all processes in the process tree, including the root process
   * @param pid 
   * @param signal defaults to SIGTERM
   */
  function kill(pid : number, signal? : Signal, callback? : (err) => void) : void
  export = kill
}
