export type LocalForward = {
  id: number;
  sessionId: number;
  bindAddr: string;
  destHost: string;
  destPort: number;
};


export type RemoteForward = {
  id: number;
  sessionId: number;
  remoteHost: string;
  remotePort: number;
  localHost: string;
  localPort: number;
};
