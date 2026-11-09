// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IVault {
    function deposit(bytes32 pocket) external payable;
    function withdraw(address token, uint256 amount, bytes32 pocket, address to) external;
}

/// @dev Test helper: tries to withdraw again from inside the ETH transfer of a withdrawal.
contract Reenter {
    IVault public immutable vault;
    bool public reentered;
    uint256 private amt;

    constructor(IVault v) { vault = v; }

    function start() external payable {
        amt = msg.value;
        vault.deposit{value: msg.value}(bytes32(0));
        vault.withdraw(address(0), amt, bytes32(0), address(this));
    }

    receive() external payable {
        if (msg.sender != address(vault) || reentered) return;
        try vault.withdraw(address(0), amt, bytes32(0), address(this)) { reentered = true; } catch {}
    }
}
