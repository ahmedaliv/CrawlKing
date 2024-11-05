import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { client } from '@/utils/client';
import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const signIn = async ({
    username,
    password
  }: {
    username: string;
    password: string;
  }) => {
    try {
      const response = await client.post('users/login', {
        json: { username, password },
        method: 'post'
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid username or password');
        }
        throw new Error(`An Unexpected Error Occurred`);
      }
      return (await response.json()) as { token: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.name === 'TypeError') {
        throw new Error('Server is Down');
      }
      if (error.name === 'HTTPError' && error.response.status === 401) {
        throw new Error('Invalid username or password');
      }
      throw new Error('An Unexpected Error Occurred');
    }
  };
  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: (data) => {
      localStorage.setItem('token', data?.token || '');
      const from = location.state?.from || '/';
      navigate(from);
    },
    onError: (error) => {
      // Set the error message state
      setErrorMessage(error.message || 'An error occurred');
    }
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(''); // Clear previous error message
    mutation.mutate({ username, password });
  };
  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <Card className="w-auto p-7 lg:w-2/6">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold">
            CrawlKing
          </CardTitle>
          <CardDescription className="text-center text-sm font-semibold">
            Login to CrawlKing
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <Input
            autoComplete="username"
            className="mb-4 p-4 px-10"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
          />
          <Input
            className="mb-4 p-4 px-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            required
          />
          {errorMessage && (
            <p className="mb-4 font-bold text-red-500">{errorMessage}</p>
          )}
          <Button className="w-full" type="submit">
            Login
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default Login;
