// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Masque Vault (testnet preview)
/// @notice Holds ETH and ERC-20 tokens for their owners in named pockets. Only an owner can move or withdraw
///         their own balance, to any address they choose. A pocket can be locked until a time; a lock can only
///         be extended. There is no admin: nobody can pause the vault, change it, or touch anyone's balance.
/// @dev    Every deposit and withdrawal is a public transaction. The vault keeps holdings off the owner's wallet
///         page; it does not hide who deposited or where funds went.
contract MasqueVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant ETH = address(0);

    /// owner => pocket => token => amount
    mapping(address => mapping(bytes32 => mapping(address => uint256))) public balanceOf;
    /// owner => pocket => unix time before which nothing leaves the pocket
    mapping(address => mapping(bytes32 => uint64)) public lockedUntil;

    event Deposited(address indexed owner, bytes32 indexed pocket, address indexed token, uint256 amount);
    event Withdrawn(address indexed owner, bytes32 indexed pocket, address indexed token, uint256 amount, address to);
    event Moved(address indexed owner, bytes32 from, bytes32 to, address indexed token, uint256 amount);
    event Locked(address indexed owner, bytes32 indexed pocket, uint64 until);

    error ZeroAmount();
    error ZeroAddress();
    error PocketLocked(uint64 until);
    error Insufficient(uint256 available);
    error LockCanOnlyExtend(uint64 current);
    error EthTransferFailed();

    /// @notice Put ETH into one of your pockets.
    function deposit(bytes32 pocket) external payable {
        if (msg.value == 0) revert ZeroAmount();
        balanceOf[msg.sender][pocket][ETH] += msg.value;
        emit Deposited(msg.sender, pocket, ETH, msg.value);
    }

    /// @notice Put an ERC-20 into one of your pockets (approve this vault first). Credits what actually arrived,
    ///         so fee-on-transfer tokens cannot inflate a balance.
    function depositToken(IERC20 token, uint256 amount, bytes32 pocket) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (address(token) == ETH) revert ZeroAddress();
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
        balanceOf[msg.sender][pocket][address(token)] += received;
        emit Deposited(msg.sender, pocket, address(token), received);
    }

    /// @notice Send part of a pocket to any address. Use address(0) as the token for ETH.
    function withdraw(address token, uint256 amount, bytes32 pocket, address to) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        uint64 until = lockedUntil[msg.sender][pocket];
        if (block.timestamp < until) revert PocketLocked(until);
        uint256 bal = balanceOf[msg.sender][pocket][token];
        if (bal < amount) revert Insufficient(bal);
        balanceOf[msg.sender][pocket][token] = bal - amount;
        emit Withdrawn(msg.sender, pocket, token, amount, to);
        if (token == ETH) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @notice Move a balance between two of your own pockets. A locked pocket can receive but not send.
    function move(address token, uint256 amount, bytes32 from, bytes32 to) external {
        if (amount == 0) revert ZeroAmount();
        uint64 until = lockedUntil[msg.sender][from];
        if (block.timestamp < until) revert PocketLocked(until);
        uint256 bal = balanceOf[msg.sender][from][token];
        if (bal < amount) revert Insufficient(bal);
        balanceOf[msg.sender][from][token] = bal - amount;
        balanceOf[msg.sender][to][token] += amount;
        emit Moved(msg.sender, from, to, token, amount);
    }

    /// @notice Lock one of your pockets until `until`. A lock can be extended, never shortened.
    function lock(bytes32 pocket, uint64 until) external {
        uint64 current = lockedUntil[msg.sender][pocket];
        if (until <= current) revert LockCanOnlyExtend(current);
        lockedUntil[msg.sender][pocket] = until;
        emit Locked(msg.sender, pocket, until);
    }
}
