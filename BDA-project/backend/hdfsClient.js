const axios = require('axios');

class HdfsClient {
  constructor({ host, user }) {
    this.host = host.replace(/\/$/, '');
    this.user = user || 'hduser';
    console.log(`[HDFS Client] Initialized with host: ${this.host}, user: ${this.user}`);
  }

  async ensureDir(path) {
    const url = `${this.host}/webhdfs/v1${path}?op=MKDIRS&user.name=root`;
    console.log(`[HDFS] Making directory: ${url}`);
    try {
      const res = await axios.put(url, null, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400, timeout: 5000 });
      return res.data;
    } catch (err) {
      // MKDIRS may return 200 or other statuses; ignore errors if directory exists
      console.error(`[HDFS] Error making directory: ${err.message}`);
      return null;
    }
  }

  async writeFile(path, data) {
    // ensure parent dir
    const dir = path.substring(0, path.lastIndexOf('/')) || '/';
    await this.ensureDir(dir);

    const createUrl = `${this.host}/webhdfs/v1${path}?op=CREATE&overwrite=true&user.name=root`;
    console.log(`[HDFS] Writing file: ${createUrl}`);
    try {
      // first request gets 307 with location to datanode
      const r1 = await axios.put(createUrl, null, { maxRedirects: 0, validateStatus: s => s === 307, timeout: 5000 });
      const location = r1.headers.location;
      if (!location) throw new Error('No redirect location for create');
      console.log(`[HDFS] Got redirect to: ${location}`);
      // upload data to datanode
      await axios.put(location, data, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 5000 });
      console.log(`[HDFS] File written successfully`);
      return true;
    } catch (err) {
      // Some Hadoop versions accept the initial request directly
      console.error(`[HDFS] Write error: ${err.message}`);
      if (err.response && err.response.status >= 200 && err.response.status < 300) return true;
      throw err;
    }
  }

  async readFile(path) {
    const openUrl = `${this.host}/webhdfs/v1${path}?op=OPEN&user.name=${this.user}`;
    try {
      const r1 = await axios.get(openUrl, { maxRedirects: 0, validateStatus: s => s === 307 });
      const location = r1.headers.location;
      if (!location) throw new Error('No redirect location for open');
      const res = await axios.get(location, { responseType: 'text' });
      return res.data;
    } catch (err) {
      // If it returned the content directly
      if (err.response && err.response.status >= 200 && err.response.status < 300) return err.response.data;
      // If file not found, return null
      if (err.response && err.response.status === 404) return null;
      throw err;
    }
  }
}

module.exports = HdfsClient;
