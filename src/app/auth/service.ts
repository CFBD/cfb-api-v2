import axios from 'axios';

const emailPattern =
  /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;

const endpoint = process.env.AUTH_URL;

export const generateApiKey = async (email: string) => {
  if (!emailPattern.test(email.toLowerCase())) {
    return Promise.reject(new Error('Invalid email address'));
  }

  await axios.post(`${endpoint}/key`, { email });
};
