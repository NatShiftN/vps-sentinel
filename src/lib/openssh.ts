export type OpenSshConfig = {
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
  x11: boolean;
  agent: boolean;
};

export type OpenSshSessionInfo = {
  sessionId: number;
  clientId: string;
  command: string;
};
