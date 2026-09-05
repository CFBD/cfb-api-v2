import 'dotenv/config';
import path from 'node:path';
import { runCluster } from './config/clusterRuntime';

try {
  runCluster(path.join(__dirname, 'app.js'));
} catch (error) {
  console.error(error);
  process.exit(1);
}
