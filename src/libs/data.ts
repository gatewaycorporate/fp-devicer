export interface UserData {
  fonts: string[];
  hardware: {
    cpu: string;
    gpu: string;
    ram: number; // in MB
  }
  userAgent: string;
  screen: {
    width: number;
    height: number;
    colorDepth: number;
  };
  timezone: string;
  ip: string;
  languages: string[];
  plugins: string[];
  canvasHash: string;
  audioHash: string;
  webglHash: string;
}