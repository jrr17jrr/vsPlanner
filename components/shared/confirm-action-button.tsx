"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { VariantProps } from "class-variance-authority";

type ActionResult = { error?: string; success?: string } | void;

/**
 * Botão + AlertDialog de confirmação para uma Server Action assíncrona:
 * mostra erro/sucesso via toast, só fecha o diálogo em caso de sucesso.
 */
export function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel = "Confirmar",
  variant = "outline",
  confirmVariant = "destructive",
  size = "sm",
  disabled,
  onConfirm,
}: {
  label: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  confirmVariant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  disabled?: boolean;
  onConfirm: () => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (result && "success" in result && result.success) {
        toast.success(result.success);
      }
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size={size} variant={variant} disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant={confirmVariant} onClick={handleConfirm} disabled={pending}>
            {pending ? "Aguarde…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
