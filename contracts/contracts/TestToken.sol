// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Masque test token (testnet only, worth nothing)
/// @notice Anyone can take a fixed amount from the faucet once an hour, so the vault can be tried with
///         stock-like tokens. There is no owner and no other way to mint.
contract TestToken is ERC20 {
    uint256 public immutable drip;
    uint8 private immutable _dec;
    mapping(address => uint256) public lastDrip;

    error TooSoon(uint256 nextAt);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 drip_) ERC20(name_, symbol_) {
        _dec = decimals_;
        drip = drip_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function faucet() external {
        uint256 next = lastDrip[msg.sender] + 1 hours;
        if (lastDrip[msg.sender] != 0 && block.timestamp < next) revert TooSoon(next);
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, drip);
    }
}
