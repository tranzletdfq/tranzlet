import { supabase } from './supabase.js';
import { getCurrentAuthenticatedUser } from './authManager.js';

const BUCKET_NAME = 'tranzlet_assets';
const PROOF_FOLDER = 'payment-proofs';
const SIGNED_URL_TTL_SECONDS = 60;
const MAX_PROOF_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const getSafeExtension = (file) => {
    const extension = file.name?.split('.').pop()?.toLowerCase();
    const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
    return allowedExtensions.has(extension) ? extension : 'bin';
};

export const submitPaymentProof = async (tagId, senderName, transactionIdentifier, proofFile) => {
    const user = await getCurrentAuthenticatedUser();

    if (!tagId || !senderName?.trim() || !transactionIdentifier?.trim() || !proofFile) {
        throw new Error('Tag ID, sender name, transaction ID, and proof file are required.');
    }

    if (!ALLOWED_PROOF_TYPES.has(proofFile.type)) {
        throw new Error('Unsupported proof format. Upload a JPG, PNG, WEBP, or PDF file.');
    }

    if (proofFile.size <= 0 || proofFile.size > MAX_PROOF_SIZE_BYTES) {
        throw new Error('Payment proof must be smaller than 10 MB.');
    }

    // Confirm the tag belongs to the authenticated user and is still pending
    // before creating a storage object.
    const { data: tag, error: tagError } = await supabase
        .from('tranzlet_tags')
        .select('id, status')
        .eq('id', tagId)
        .eq('user_id', user.id)
        .single();

    if (tagError || !tag) {
        throw new Error('Remittance tag not found or access denied.');
    }

    if (tag.status !== 'PENDING_DEPOSIT') {
        throw new Error('Payment proof can only be submitted for a pending remittance tag.');
    }

    const fileExt = getSafeExtension(proofFile);
    const filePath = `${PROOF_FOLDER}/${user.id}/${tagId}-${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, proofFile, {
            cacheControl: '3600',
            contentType: proofFile.type,
            upsert: false
        });

    if (uploadError) {
        throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
    }

    // Keep only the private object path in the database. Never store a public
    // URL for sensitive payment evidence.
    const { data: updatedTag, error: updateError } = await supabase
        .from('tranzlet_tags')
        .update({
            sender_name: senderName.trim(),
            transaction_identifier: transactionIdentifier.trim(),
            proof_image_url: filePath,
            status: 'PROOF_SUBMITTED',
            updated_at: new Date().toISOString()
        })
        .eq('id', tagId)
        .eq('user_id', user.id)
        .eq('status', 'PENDING_DEPOSIT')
        .select()
        .single();

    if (updateError) {
        // Best-effort cleanup so a failed database update does not leave an
        // unreferenced payment proof in private storage.
        await supabase.storage.from(BUCKET_NAME).remove([filePath]);
        throw new Error(`Failed to link payment proof to tag: ${updateError.message}`);
    }

    return updatedTag;
};

export const getSecureProofSignedUrl = async (filePath) => {
    const user = await getCurrentAuthenticatedUser();

    if (!filePath || !filePath.startsWith(`${PROOF_FOLDER}/`)) {
        throw new Error('Invalid payment proof path.');
    }

    // Access is enforced by the private bucket's storage RLS policy. The
    // signed URL is deliberately short-lived because payment proofs contain
    // sensitive transaction information.
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
        throw new Error(`Failed to generate secure proof URL: ${error?.message || 'Unable to create signed URL.'}`);
    }

    return data.signedUrl;
};
