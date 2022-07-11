const { getOfferSummary, getOfferValidity, getNftCoinInfo } = require("./get-offer-summary");
const { getTableName } = require("./get-table-name");
const { pool } = require("./query-db");
const logger = require("pino")();
const { saveNFTInfos } = require("./save-nft-infos");

/** Adds an offer to the postgres table, returns false if the offer could not be added */
const addOfferEntryToPGDB = async (offer) => {
  try {
    const offerSummary = await getOfferSummary(offer);
    if (!offerSummary || !offerSummary.success) {
      return true;
    }
    const offered_cats = [];
    for (let cat in offerSummary.summary.offered) {
      offered_cats.push(cat);
    }
    const requested_cats = [];
    for (let cat in offerSummary.summary.requested) {
      requested_cats.push(cat);
    }

    // If the offer has any nft's, make sure entries for those NFTs exist in the nft_info table
    const nfts = [];
    const infos = offerSummary && offerSummary.summary && offerSummary.summary.infos
    if(infos) {
      for(let nftCoinId in infos) {
        if(infos[nftCoinId] && infos[nftCoinId].launcher_id) {
          const nftCoinInfo = await getNftCoinInfo(infos[nftCoinId].launcher_id);
          nfts.push(getNftDTO(nftCoinId, nftCoinInfo, infos[nftCoinId].launcher_id));
        }
      }
    }
    try {
      await saveNFTInfos(nfts);
    } catch (e) {
      logger.error(e);
      logger.info("continuing to add offer through NFT addition error")
    }

    const offerStatus = await getOfferValidity(offer);
    if (!offerStatus || !offerStatus.success) {
      return true;
    }

    let status = 0;
    if (offerStatus.valid) {
      status = 1;
    }
    const result = await pool.query(
      `INSERT into "${getTableName()}"(hash, offer, status, offered_cats, requested_cats, parsed_offer) VALUES (sha256($1), $2, $3, $4, $5, $6)`,
      [
        offer,
        offer,
        status,
        offered_cats,
        requested_cats,
        JSON.stringify(offerSummary.summary),
      ]
    );
    logger.info({ offer }, "added offer successfully");
  } catch (err) {
    logger.error({ offer, err }, "error adding offer");
    return false;
  }
  return true;
};

const getNftDTO = (nftCoinId, nftCoinInfo, launcher_id) => {
  return {
    coin_id: nftCoinId,
    nft_info: nftCoinInfo.nft_info,
    success: nftCoinInfo.success,
    minter_did_id: nftCoinInfo.minter_did_id,
    collection_id: nftCoinInfo.collection_id,
  };
};


module.exports.addOfferEntryToPGDB = addOfferEntryToPGDB;


