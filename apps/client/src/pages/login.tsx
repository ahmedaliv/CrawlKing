import { useSignInMutation } from '@/api/mutations';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormEvent, useState } from 'react';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const signInMutation = useSignInMutation(setErrorMessage);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(''); // Clear previous error message
    signInMutation.mutate({ username, password });
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
