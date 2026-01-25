import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { z } from 'zod';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string()
    .regex(/^[+]?[0-9\s-]{7,20}$/, 'Please enter a valid phone number')
    .or(z.literal('')),
});

interface ProfileSettingsProps {
  userId: string;
  initialName: string | null;
  initialPhone: string | null;
  onClose: () => void;
  onSave: () => void;
}

export function ProfileSettings({ 
  userId, 
  initialName, 
  initialPhone, 
  onClose, 
  onSave 
}: ProfileSettingsProps) {
  const [name, setName] = useState(initialName || '');
  const [phone, setPhone] = useState(initialPhone || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string }>({});

  const handleSave = async () => {
    // Validate
    const result = profileSchema.safeParse({ full_name: name, phone });
    if (!result.success) {
      const fieldErrors: { full_name?: string; phone?: string } = {};
      result.error.errors.forEach(err => {
        const field = err.path[0] as 'full_name' | 'phone';
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      // Normalize phone to E.164 format for Ireland
      let normalizedPhone = phone.trim();
      if (normalizedPhone && !normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.replace(/[^0-9]/g, '');
        normalizedPhone = '+353' + normalizedPhone.replace(/^0/, '');
      }

      const { error } = await supabase
        .from('profiles')
        .update({ 
          full_name: name.trim(), 
          phone: normalizedPhone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Profile updated successfully!');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      
      // Handle specific error codes
      if (error?.code === '42501' || error?.message?.includes('row-level security')) {
        toast.error('Session expired. Please log out and back in.');
      } else if (error?.code === '23505') {
        toast.error('This phone number is already in use.');
      } else {
        toast.error('Failed to update profile. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg text-foreground">Edit Profile</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="bg-secondary/50"
          />
          {errors.full_name && (
            <p className="text-xs text-destructive">{errors.full_name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g., 085 123 4567"
            className="bg-secondary/50"
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Used for SMS order notifications
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 gap-2"
            disabled={saving}
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
