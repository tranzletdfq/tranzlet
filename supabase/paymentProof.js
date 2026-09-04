import { supabase } from './supabase.js';
import { getCurrentAuthenticatedUser } from './authManager.js';

export const submitPaymentProof = async (tagId, senderName, transactionIdentifier, proofFile) => {
    const user = await getCurrentAuthenticatedUser();

    if (!tagId || !senderName || !transactionIdentifier) {
        throw new Error('All proof details (Tag ID, Sender Name, Transaction ID) are required.');
    }

    let proofImageUrl = null;

    // Optional file upload if an image proof is provided
    if (proofFile) {
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = `payment-proofs/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('tranzlet_assets')
            .upload(filePath, proofFile);

        if (uploadError) {
            throw new Error(`Failed to upload payment proof image: ${uploadError.message}`);
        }

        const { data: publicURLData } = supabase.storage
            .from('tranzlet_assets')
            .getPublicUrl(filePath);

        proofImageUrl = publicURLData.publicUrl;
    }

    // Update the tag with submission details and advance the status
    const { data, error } = await supabase
        .from('tranzlet_tags')
        .update({
            sender_name: senderName.trim(),
            transaction_identifier: transactionIdentifier.trim(),
            proof_image_url: proofImageUrl,
            status: 'PROOF_SUBMITTED'
        })
        .eq('id', tagId)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to submit payment proof: ${error.message}`);
    }

    return data;
};
