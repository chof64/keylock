"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";

type KeyUser = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  platformUserId: string | null;
};

export default function KeyUsersPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const listKeyUsersQuery = api.keyUsers.list.useQuery();

  const createKeyUserMutation = api.keyUsers.create.useMutation({
    onSuccess: () => {
      listKeyUsersQuery.refetch();
      setName("");
      setEmail("");
      setIsCreateDialogOpen(false);
      toast.success("User created successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to create user: ${error.message}`);
    },
  });

  const handleCreateKeyUser = () => {
    if (name.trim()) {
      createKeyUserMutation.mutate({
        name: name.trim(),
        email: email.trim() || undefined,
      });
    }
  };

  if (listKeyUsersQuery.isLoading) return <p>Loading users...</p>;
  if (listKeyUsersQuery.error)
    return <p>Error loading users: {listKeyUsersQuery.error.message}</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">User Management (KeyLock Users)</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Register New User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New KeyLock User</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="userName" className="text-right">
                  Name
                </Label>
                <Input
                  id="userName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter user's full name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="userEmail" className="text-right">
                  Email (Optional)
                </Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="col-span-3"
                  placeholder="Enter user's email address"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                type="submit"
                onClick={handleCreateKeyUser}
                disabled={createKeyUserMutation.isPending || !name.trim()}
              >
                {createKeyUserMutation.isPending
                  ? "Registering..."
                  : "Register User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {listKeyUsersQuery.data && listKeyUsersQuery.data.length === 0 && (
        <p>
          No users registered yet. Click "Register New User" to get started.
        </p>
      )}

      {listKeyUsersQuery.data && listKeyUsersQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Registered Users</CardTitle>
            <CardDescription>
              List of all users registered in the KeyLock system.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered On</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listKeyUsersQuery.data?.map((user: KeyUser) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email || "N/A"}</TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-red-600">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {/* Placeholder for future actions like Edit, Deactivate, Link to Platform User etc. */}
                      <Button variant="outline" size="sm" disabled>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
