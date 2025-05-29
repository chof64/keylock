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

// Type for the Key model
type Key = {
  id: string;
  keyId: string; // RFID Tag ID
  name: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  keyUserId: string | null; // Foreign key to KeyUser
};

// Updated KeyUser type to include the Key
type KeyUser = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  platformUserId: string | null;
  key: Key | null; // Can be null if no key is assigned
};

export default function KeyUsersPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false); // Renamed from isCreateUserDialogOpen for clarity

  // State for the "Create Key" dialog
  const [isCreateKeyDialogOpen, setIsCreateKeyDialogOpen] = useState(false);
  const [selectedKeyUserId, setSelectedKeyUserId] = useState<string | null>(
    null,
  );
  const [rfidTagId, setRfidTagId] = useState("");

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

  const createKeyMutation = api.keyUsers.createKey.useMutation({
    onSuccess: () => {
      listKeyUsersQuery.refetch(); // Refetch users to show the new key
      setRfidTagId("");
      setSelectedKeyUserId(null);
      setIsCreateKeyDialogOpen(false);
      toast.success("RFID Key created and assigned successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to create RFID Key: ${error.message}`);
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

  const openCreateKeyDialog = (keyUserId: string) => {
    setSelectedKeyUserId(keyUserId);
    setIsCreateKeyDialogOpen(true);
  };

  const handleCreateKey = () => {
    if (selectedKeyUserId && rfidTagId.trim()) {
      createKeyMutation.mutate({
        keyUserId: selectedKeyUserId,
        keyId: rfidTagId.trim(),
        // name: "Optional Key Name" // You can add a field for this in the dialog if needed
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
                  <TableHead>RFID Key ID</TableHead>
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
                    <TableCell className="font-mono text-xs">
                      {user.key ? user.key.keyId : "No Key"}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        {!user.key && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCreateKeyDialog(user.id)}
                          >
                            Create RFID Key
                          </Button>
                        )}
                        {user.key && (
                          <Button variant="outline" size="sm" disabled>
                            Manage Key
                          </Button>
                        )}
                        {/* Placeholder for future actions like Edit, Deactivate, Link to Platform User etc. */}
                        {/* <Button variant="outline" size="sm" disabled className="ml-2"> Manage User </Button> */}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog for Creating a new RFID Key */}
      <Dialog
        open={isCreateKeyDialogOpen}
        onOpenChange={setIsCreateKeyDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New RFID Key</DialogTitle>
            <DialogDescription>
              Assign a new RFID Key to user:{" "}
              {
                listKeyUsersQuery.data?.find((u) => u.id === selectedKeyUserId)
                  ?.name
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="rfidTagId" className="text-right">
                RFID Tag ID
              </Label>
              <Input
                id="rfidTagId"
                value={rfidTagId}
                onChange={(e) => setRfidTagId(e.target.value)}
                className="col-span-3"
                placeholder="Scan or enter RFID Tag ID"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedKeyUserId(null);
                  setRfidTagId(""); // Clear input on cancel
                }}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              onClick={handleCreateKey}
              disabled={
                createKeyMutation.isPending ||
                !rfidTagId.trim() ||
                !selectedKeyUserId
              }
            >
              {createKeyMutation.isPending ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
